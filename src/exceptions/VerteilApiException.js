/**
 * @fileoverview Custom exception class for Verteil API errors.
 * Wraps HTTP and business-logic errors with structured error payloads.
 */

/**
 * Thrown whenever a Verteil API call fails — either at the network layer
 * (connection timeout, TLS error) or at the application layer (4xx / 5xx
 * status codes with a JSON error body from Verteil).
 *
 * @class VerteilApiException
 * @extends Error
 *
 * @example
 * try {
 *   await client.airShopping(params);
 * } catch (err) {
 *   if (err instanceof VerteilApiException) {
 *     console.error(err.getErrorMessage());
 *     console.error(err.getErrorResponse());
 *   }
 * }
 */
class VerteilApiException extends Error {
  /**
   * @param {string} message       Human-readable error description.
   * @param {number} [code=0]      HTTP status code or application error code.
   * @param {Error}  [previous]    Original upstream error for chaining.
   * @param {Object} [errorResponse] Raw JSON error payload from the Verteil API.
   */
  constructor(message = '', code = 0, previous = null, errorResponse = null) {
    super(message);

    /** @type {string} */
    this.name = 'VerteilApiException';

    /** @type {number} */
    this.code = code;

    /** @type {Error|null} */
    this.previous = previous;

    /** @type {Object|null} Raw Verteil API error payload */
    this._errorResponse = errorResponse;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VerteilApiException);
    }
  }

  /**
   * Returns the raw error payload received from the Verteil API.
   *
   * @returns {Object|null}
   */
  getErrorResponse() {
    return this._errorResponse;
  }

  /**
   * Returns the human-readable error message.
   *
   * @returns {string}
   */
  getErrorMessage() {
    return this.message;
  }
}

export default VerteilApiException;
