/**
 * @fileoverview Sliding-window circuit breaker for Verteil API endpoints.
 *
 * States: CLOSED (normal) → OPEN (failing fast) → HALF_OPEN (probing).
 *
 * When the failure rate in the current window exceeds `failureThreshold`,
 * the breaker opens and immediately rejects subsequent calls.  After
 * `resetTimeout` milliseconds the breaker moves to HALF_OPEN and lets
 * one probe request through.  A successful probe closes the breaker; a
 * failed probe reopens it.
 */

/** @enum {string} */
export const State = Object.freeze({
  CLOSED:    'CLOSED',
  OPEN:      'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

/**
 * Per-endpoint circuit breaker.
 *
 * @class CircuitBreaker
 *
 * @example
 * const cb = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 30_000 });
 * try {
 *   const result = await cb.execute('airShopping', () => client._rawRequest(params));
 * } catch (err) {
 *   if (err.code === 'CIRCUIT_OPEN') { ... }
 * }
 */
class CircuitBreaker {
  /**
   * @param {Object} [options]
   * @param {number} [options.failureThreshold=5]   Failures in window before opening.
   * @param {number} [options.successThreshold=2]   Consecutive successes to re-close from HALF_OPEN.
   * @param {number} [options.resetTimeout=30000]   Ms to wait before probing (OPEN→HALF_OPEN).
   * @param {number} [options.windowSize=60000]     Sliding window duration in ms.
   * @param {Function} [options.onStateChange]      Called with (endpoint, oldState, newState).
   */
  constructor(options = {}) {
    this._failureThreshold  = options.failureThreshold  ?? 5;
    this._successThreshold  = options.successThreshold  ?? 2;
    this._resetTimeout      = options.resetTimeout      ?? 30_000;
    this._windowSize        = options.windowSize        ?? 60_000;
    this._onStateChange     = options.onStateChange     ?? null;

    /** @private @type {Map<string, Object>} */
    this._breakers = new Map();
  }

  /**
   * Executes `fn` through the circuit breaker for the given endpoint.
   *
   * State-machine transitions triggered here:
   *
   *   CLOSED  + failure threshold crossed  → OPEN
   *   OPEN    + resetTimeout elapsed       → HALF_OPEN  (via this method on next call)
   *   HALF_OPEN + probe succeeds N times   → CLOSED
   *   HALF_OPEN + probe fails once         → OPEN  (reset openedAt)
   *
   * @param {string}   endpoint - Logical endpoint name.
   * @param {Function} fn       - Async function to execute.
   * @returns {Promise<*>}
   * @throws {Error} With `code: 'CIRCUIT_OPEN'` when breaker is open.
   */
  async execute(endpoint, fn) {
    const breaker = this._getBreaker(endpoint);

    // ── OPEN state guard ──────────────────────────────────────────────────────
    if (breaker.state === State.OPEN) {
      if (Date.now() - breaker.openedAt >= this._resetTimeout) {
        // Enough time has passed — let one probe through by moving to HALF_OPEN.
        // The transition is lazy (driven by the next incoming call) rather than
        // using a timer, so no background timers are ever created.
        this._transition(endpoint, breaker, State.HALF_OPEN);
      } else {
        // Still within the reset window — fail fast without calling fn().
        // Attaching retryAfterMs lets callers surface a useful error message.
        const waitMs = this._resetTimeout - (Date.now() - breaker.openedAt);
        const err = new Error(
          `Circuit breaker OPEN for "${endpoint}". Retry in ${Math.ceil(waitMs / 1000)}s.`,
        );
        err.code = 'CIRCUIT_OPEN';
        err.retryAfterMs = waitMs;
        throw err;
      }
    }

    // ── HALF_OPEN state guard ─────────────────────────────────────────────────
    // Only one probe is allowed in flight at a time.  If a probe is already in
    // progress (probeInFlight = true), reject additional calls with CIRCUIT_OPEN
    // so we don't accidentally hammer the upstream while it is recovering.
    if (breaker.state === State.HALF_OPEN && breaker.probeInFlight) {
      const err = new Error(`Circuit breaker HALF_OPEN for "${endpoint}": probe in flight.`);
      err.code = 'CIRCUIT_OPEN';
      throw err;
    }

    // Mark that a probe is in flight so concurrent callers are blocked.
    if (breaker.state === State.HALF_OPEN) {
      breaker.probeInFlight = true;
    }

    // ── Execute fn() and record the outcome ───────────────────────────────────
    try {
      const result = await fn();
      // Success: increment consecutiveSuccesses; close the breaker once the
      // success threshold is reached (avoids re-closing on a single lucky response).
      this._onSuccess(endpoint, breaker);
      return result;
    } catch (err) {
      // Failure: push a timestamp into the sliding window; open if threshold hit.
      this._onFailure(endpoint, breaker);
      throw err;
    }
  }

  /**
   * Returns the current state for an endpoint.
   *
   * @param {string} endpoint
   * @returns {string} One of `State.*`
   */
  getState(endpoint) {
    return this._getBreaker(endpoint).state;
  }

  /**
   * Returns a stats snapshot for an endpoint.
   *
   * @param {string} endpoint
   * @returns {{ state: string, failures: number, successes: number, lastFailureAt: number|null }}
   */
  getStats(endpoint) {
    const b = this._getBreaker(endpoint);
    return {
      state:         b.state,
      failures:      b.failures.length,
      successes:     b.consecutiveSuccesses,
      lastFailureAt: b.failures.at(-1) ?? null,
    };
  }

  /**
   * Manually resets a breaker to CLOSED state.
   *
   * @param {string} endpoint
   */
  reset(endpoint) {
    const b = this._getBreaker(endpoint);
    const old = b.state;
    this._initBreaker(b);
    if (old !== State.CLOSED) this._emitStateChange(endpoint, old, State.CLOSED);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  _getBreaker(endpoint) {
    if (!this._breakers.has(endpoint)) {
      const b = {};
      this._initBreaker(b);
      this._breakers.set(endpoint, b);
    }
    return this._breakers.get(endpoint);
  }

  /** @private */
  _initBreaker(b) {
    b.state                = State.CLOSED;
    b.failures             = [];   // timestamps of failures in window
    b.consecutiveSuccesses = 0;
    b.openedAt             = null;
    b.probeInFlight        = false;
  }

  /** @private */
  _onSuccess(endpoint, breaker) {
    breaker.probeInFlight = false;
    breaker.consecutiveSuccesses += 1;

    // Require successThreshold consecutive successes (not just one) before closing
    // the breaker.  A single successful probe could be a fluke if the upstream is
    // intermittently healthy; multiple successes build more confidence.
    if (breaker.state === State.HALF_OPEN && breaker.consecutiveSuccesses >= this._successThreshold) {
      this._transition(endpoint, breaker, State.CLOSED);
    }
  }

  /** @private */
  _onFailure(endpoint, breaker) {
    breaker.probeInFlight        = false;
    breaker.consecutiveSuccesses = 0;  // reset streak on any failure

    const now = Date.now();
    // Record this failure's timestamp in the sliding window array.
    breaker.failures.push(now);

    // Evict timestamps that fell outside the window.  This is the "sliding"
    // part: old failures age out so the counter doesn't stay elevated forever.
    // Example: if windowSize=60s and the last 5 failures happened 2 minutes ago,
    // they are purged here and the breaker stays CLOSED.
    const cutoff = now - this._windowSize;
    breaker.failures = breaker.failures.filter(t => t > cutoff);

    if (
      breaker.state !== State.OPEN &&
      breaker.failures.length >= this._failureThreshold
    ) {
      // In-window failure count hit the threshold — open the breaker.
      this._transition(endpoint, breaker, State.OPEN);
    } else if (breaker.state === State.HALF_OPEN) {
      // Any failure during the probe phase immediately re-opens the breaker
      // rather than requiring another full window of failures.  This is
      // intentionally aggressive: a failed probe means the service is not
      // ready yet, so we go straight back to fast-failing.
      this._transition(endpoint, breaker, State.OPEN);
    }
  }

  /** @private */
  _transition(endpoint, breaker, newState) {
    const old = breaker.state;
    breaker.state = newState;
    if (newState === State.OPEN) {
      breaker.openedAt = Date.now();
      breaker.consecutiveSuccesses = 0;
    } else if (newState === State.CLOSED) {
      breaker.failures  = [];
      breaker.openedAt  = null;
      breaker.consecutiveSuccesses = 0;
    } else if (newState === State.HALF_OPEN) {
      breaker.probeInFlight = false;
      breaker.consecutiveSuccesses = 0;
    }
    this._emitStateChange(endpoint, old, newState);
  }

  /** @private */
  _emitStateChange(endpoint, from, to) {
    if (typeof this._onStateChange === 'function') {
      try { this._onStateChange(endpoint, from, to); } catch { /* noop */ }
    }
  }
}

export default CircuitBreaker;
