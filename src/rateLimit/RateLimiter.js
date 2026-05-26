/**
 * @fileoverview In-process sliding-window rate limiter for Verteil API endpoints.
 *
 * Each endpoint maintains an independent request counter that resets after
 * the configured `duration` window.  Attempts that exceed the limit return
 * `false`; callers are responsible for throwing or waiting as appropriate.
 */

import NodeCache from 'node-cache';

const PREFIX = 'verteil_ratelimit_';

/**
 * Default rate-limit configuration.
 *
 * @private
 * @type {Object.<string, {requests: number, duration: number}>}
 */
const DEFAULT_LIMITS = {
  default:     { requests: 60, duration: 60 },
  airShopping: { requests: 30, duration: 60 },
  orderCreate: { requests: 20, duration: 60 },
};

/**
 * Sliding-window rate limiter.
 *
 * @class RateLimiter
 *
 * @example
 * const limiter = new RateLimiter();
 * if (!limiter.attempt('airShopping')) {
 *   const wait = limiter.retryAfter('airShopping');
 *   throw new Error(`Rate limited. Retry after ${wait}s`);
 * }
 */
class RateLimiter {
  /**
   * @param {Object.<string, {requests: number, duration: number}>} [limits]
   *   Per-endpoint limits.  Merged on top of `DEFAULT_LIMITS`.
   */
  constructor(limits = {}) {
    /** @private @type {Object.<string, {requests: number, duration: number}>} */
    this._limits = { ...DEFAULT_LIMITS, ...limits };

    /** @private @type {NodeCache} */
    this._store = new NodeCache({ useClones: false });
  }

  /**
   * Records a request attempt for the given endpoint.
   *
   * Window behaviour:
   *  - On the first request in a window, the counter is set to 1 and a TTL of
   *    `duration` seconds is started.  The TTL acts as the window expiry.
   *  - On subsequent requests, we re-set the counter to current+1 with the
   *    REMAINING time from the original TTL so the window does not reset on
   *    every call.
   *  - When `current >= requests` the call is rejected (returns false).
   *
   * Important node-cache API note:
   *   `store.getTtl(key)` returns the absolute epoch timestamp (in milliseconds)
   *   when the key will expire, NOT the remaining TTL in seconds.
   *   `store.set(key, value, ttl)` expects the TTL in SECONDS.
   *   We must therefore convert:  remainingSecs = (epochExpiry - Date.now()) / 1000
   *
   * @param {string} endpoint Verteil endpoint name.
   * @returns {boolean} `true` when the request is within the limit,
   *   `false` when the limit has been exceeded.
   */
  attempt(endpoint) {
    const key = this._key(endpoint);
    const { requests, duration } = this._getLimit(endpoint);
    const current = this._store.get(key) ?? 0;

    // Reject early if the counter has already hit the limit for this window.
    if (current >= requests) return false;

    if (current === 0) {
      // First request in a new window: start the counter at 1 and begin the TTL.
      this._store.set(key, 1, duration);
    } else {
      // Subsequent request: increment the counter while keeping the ORIGINAL window
      // expiry.  getTtl() returns the absolute expiry epoch in ms; we convert to
      // remaining seconds (minimum 1s to avoid a zero-TTL which would expire immediately).
      const remainingSecs = Math.ceil((this._store.getTtl(key) - Date.now()) / 1000);
      this._store.set(key, current + 1, Math.max(1, remainingSecs));
    }

    return true;
  }

  /**
   * Returns the number of remaining allowed requests for this window.
   *
   * @param {string} endpoint
   * @returns {number}
   */
  remaining(endpoint) {
    const { requests } = this._getLimit(endpoint);
    const current = this._store.get(this._key(endpoint)) ?? 0;
    return Math.max(0, requests - current);
  }

  /**
   * Returns the number of seconds until the current rate-limit window resets.
   *
   * @param {string} endpoint
   * @returns {number} Seconds remaining, or `0` if no active window.
   */
  retryAfter(endpoint) {
    const ttl = this._store.getTtl(this._key(endpoint));
    if (!ttl) return 0;
    return Math.max(0, Math.ceil((ttl - Date.now()) / 1000));
  }

  /**
   * Resets the counter for a specific endpoint.
   *
   * @param {string} endpoint
   * @returns {void}
   */
  clear(endpoint) {
    this._store.del(this._key(endpoint));
  }

  /**
   * Resets counters for all configured endpoints.
   *
   * @returns {void}
   */
  clearAll() {
    Object.keys(this._limits).forEach(ep => this.clear(ep));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  _key(endpoint) {
    return `${PREFIX}${endpoint}`;
  }

  /** @private */
  _getLimit(endpoint) {
    return this._limits[endpoint] ?? this._limits.default;
  }
}

export default RateLimiter;
