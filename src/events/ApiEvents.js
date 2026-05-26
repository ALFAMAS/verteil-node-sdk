/**
 * @fileoverview Lightweight event objects emitted during the Verteil API
 * request lifecycle.
 *
 * These classes carry contextual data for subscribers of a Node.js
 * EventEmitter (or any compatible bus) and are intentionally plain data
 * holders — no methods beyond the constructor.
 */

/**
 * Emitted immediately before an API request is dispatched.
 *
 * @class ApiRequestEvent
 */
class ApiRequestEvent {
  /**
   * @param {string} endpoint   Verteil endpoint name (e.g. `'airShopping'`).
   * @param {Object} parameters Sanitised request parameters.
   * @param {number} duration   Elapsed time since the request was initiated (ms).
   */
  constructor(endpoint, parameters, duration) {
    /** @type {string} */
    this.endpoint = endpoint;
    /** @type {Object} */
    this.parameters = parameters;
    /** @type {number} */
    this.duration = duration;
  }
}

/**
 * Emitted after a successful API response is received and parsed.
 *
 * @class ApiResponseEvent
 */
class ApiResponseEvent {
  /**
   * @param {string} endpoint   Verteil endpoint name.
   * @param {Object} response   Parsed response payload.
   * @param {number} statusCode HTTP status code.
   * @param {number} duration   Round-trip time in milliseconds.
   */
  constructor(endpoint, response, statusCode, duration) {
    /** @type {string} */
    this.endpoint = endpoint;
    /** @type {Object} */
    this.response = response;
    /** @type {number} */
    this.statusCode = statusCode;
    /** @type {number} */
    this.duration = duration;
  }
}

/**
 * Emitted when an API call results in an error (network or application-level).
 *
 * @class ApiErrorEvent
 */
class ApiErrorEvent {
  /**
   * @param {string}      endpoint Verteil endpoint name.
   * @param {Error}       error    The thrown error.
   * @param {Object|null} [ctx]    Optional additional context.
   */
  constructor(endpoint, error, ctx = null) {
    /** @type {string} */
    this.endpoint = endpoint;
    /** @type {Error} */
    this.error = error;
    /** @type {Object|null} */
    this.context = ctx;
  }
}

/**
 * Emitted whenever the OAuth2 bearer token is refreshed.
 *
 * @class TokenRefreshEvent
 */
class TokenRefreshEvent {
  /**
   * @param {string} newToken  The newly obtained bearer token.
   * @param {number} expiresIn Token lifetime in seconds.
   */
  constructor(newToken, expiresIn) {
    /** @type {string} */
    this.newToken = newToken;
    /** @type {number} */
    this.expiresIn = expiresIn;
  }
}

export { ApiRequestEvent, ApiResponseEvent, ApiErrorEvent, TokenRefreshEvent };
