/**
 * @fileoverview Exponential-backoff retry handler for transient Verteil API failures.
 *
 * Retryable conditions:
 *  - Network errors (ECONNRESET, ETIMEDOUT, axios network error)
 *  - HTTP 408, 429, 500, 502, 503, 504
 *
 * Non-retryable conditions (fail-fast):
 *  - 4xx errors other than 408 and 429
 *  - {@link VerteilApiException} instances thrown by business logic
 */

import VerteilApiException from '../exceptions/VerteilApiException.js';

/** @type {number[]} HTTP status codes that warrant a retry. */
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Asynchronous retry wrapper with jittered exponential backoff.
 *
 * @class RetryHandler
 *
 * @example
 * const handler = new RetryHandler({ maxAttempts: 3, delay: 100 });
 * const result = await handler.execute(() => callApi(), 'airShopping');
 */
class RetryHandler {
  /**
   * @param {object} [options]
   * @param {number} [options.maxAttempts=3]  Maximum number of attempts (including the first).
   * @param {number} [options.delay=100]      Base delay in milliseconds (doubles each retry).
   */
  constructor({ maxAttempts = 3, delay = 100 } = {}) {
    /** @private @type {number} */
    this._maxAttempts = maxAttempts;

    /** @private @type {number} */
    this._delay = delay;
  }

  /**
   * Executes `fn` with automatic retry on transient failures.
   *
   * The retry loop runs up to `maxAttempts` times total (including the first
   * attempt).  Each failed attempt that passes `_shouldRetry` waits an
   * exponentially increasing delay before the next attempt.
   *
   * @template T
   * @param {() => Promise<T>} fn        Async function to execute.
   * @param {string}           [context] Descriptive label used in log messages.
   * @returns {Promise<T>}
   *
   * @throws {VerteilApiException} When all retry attempts are exhausted, or when
   *   the error is non-retryable.
   */
  async execute(fn, context = '') {
    let attempt = 1;
    let lastError;

    while (attempt <= this._maxAttempts) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;

        // Non-retryable errors (4xx, VerteilApiException, circuit OPEN) propagate
        // immediately without burning through the remaining retry budget.
        if (!this._shouldRetry(err)) throw err;

        if (attempt === this._maxAttempts) {
          // All attempts consumed.  Wrap in VerteilApiException so the caller
          // always receives a typed error regardless of what the underlying error was.
          throw new VerteilApiException(
            `Max retry attempts reached: ${err.message}`,
            err.code ?? 0,
            err,
          );
        }

        this._logRetry(err, attempt, context);
        // Wait before next attempt.  The delay grows with each attempt so we
        // back off progressively rather than hammering the API at full speed.
        await this._wait(attempt);
        attempt++;
      }
    }

    // This line is unreachable: the loop always either returns or throws inside.
    // It exists to satisfy strict TypeScript / linter "not all paths return" checks.
    throw lastError;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Determines whether an error warrants a retry attempt.
   *
   * Decision tree:
   *  - VerteilApiException → never retry (it's a semantic API failure, not transient)
   *  - HTTP response with a status code → retry only if the code is in RETRYABLE_STATUS_CODES
   *  - No HTTP response (err.request exists but err.response is absent) → network error, retry
   *  - Anything else → do not retry (unexpected error type)
   *
   * @private
   * @param {Error} err
   * @returns {boolean}
   */
  _shouldRetry(err) {
    // Never retry VerteilApiException — it represents a definitive API response.
    // The circuit-breaker CIRCUIT_OPEN error is also a VerteilApiException subtype.
    if (err instanceof VerteilApiException) return false;

    // Axios HTTP errors with a response: only specific status codes are transient.
    // 408 = request timeout, 429 = rate limited, 5xx = server-side transient errors.
    if (err.response?.status) {
      return RETRYABLE_STATUS_CODES.includes(err.response.status);
    }

    // Network-level errors: request was sent but no response was received.
    // Examples: ECONNRESET (connection dropped mid-stream), ETIMEDOUT.
    // err.request is set by axios when the request was sent but no response came back.
    if (err.request) return true;

    return false;
  }

  /**
   * Emits a warning log for the retry attempt.
   *
   * @private
   */
  _logRetry(err, attempt, context) {
    const nextDelay = this._getDelay(attempt);
    console.warn(`[VerteilRetry] attempt=${attempt} context=${context} error="${err.message}" next_in=${nextDelay}ms`);
  }

  /**
   * Returns the jittered exponential backoff delay for the given attempt number.
   *
   * Formula:
   *   backoff = baseDelay * 2^(attempt-1)
   *   jitter  = random in [0, min(1000, backoff * 0.1)]
   *   total   = backoff + jitter
   *
   * The jitter is capped at 10% of the backoff or 1000 ms, whichever is smaller.
   * Without jitter, all clients retrying at the same time would produce thundering-
   * herd spikes.  With jitter, retries are spread over a window so the server
   * receives a smoother arrival rate.
   *
   * Example with delay=100ms:
   *   attempt=1 → backoff=100ms, jitter≤10ms,  total≈100-110ms
   *   attempt=2 → backoff=200ms, jitter≤20ms,  total≈200-220ms
   *   attempt=3 → backoff=400ms, jitter≤40ms,  total≈400-440ms
   *
   * @private
   * @param {number} attempt 1-based attempt number.
   * @returns {number} Delay in milliseconds.
   */
  _getDelay(attempt) {
    const backoff = this._delay * Math.pow(2, attempt - 1);
    const jitter  = Math.floor(Math.random() * Math.min(1000, backoff * 0.1));
    return backoff + jitter;
  }

  /**
   * Returns a Promise that resolves after the computed delay.
   *
   * @private
   * @param {number} attempt
   * @returns {Promise<void>}
   */
  _wait(attempt) {
    return new Promise(resolve => setTimeout(resolve, this._getDelay(attempt)));
  }
}

export default RetryHandler;
