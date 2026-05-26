/**
 * @fileoverview Abstract base class for all Verteil API request objects.
 *
 * Concrete subclasses must implement {@link BaseRequest#getEndpoint} and
 * {@link BaseRequest#toArray}.  The optional {@link BaseRequest#getHeaders}
 * override allows subclasses to inject endpoint-specific HTTP headers
 * (e.g. `ThirdpartyId`, `OfficeId`).
 */

/**
 * Base request contract for the Verteil NDC API.
 *
 * @abstract
 * @class BaseRequest
 */
class BaseRequest {
  /**
   * @param {Object} data Validated request parameters.
   */
  constructor(data) {
    if (new.target === BaseRequest) {
      throw new TypeError('BaseRequest is abstract and cannot be instantiated directly.');
    }
    /** @protected @type {Object} */
    this.data = data;
  }

  /**
   * Returns the API endpoint path (relative to the base URL).
   *
   * @abstract
   * @returns {string}
   *
   * @example
   * // Typical implementation:
   * getEndpoint() { return '/entrygate/rest/request:airShopping'; }
   */
  getEndpoint() {
    throw new Error(`${this.constructor.name} must implement getEndpoint()`);
  }

  /**
   * Serialises the request into the JSON payload expected by the Verteil API.
   *
   * @abstract
   * @returns {Object}
   */
  toArray() {
    throw new Error(`${this.constructor.name} must implement toArray()`);
  }

  /**
   * Returns endpoint-specific HTTP headers to merge with the authorisation
   * header before dispatching the request.
   *
   * The default implementation returns an empty object; subclasses override
   * this to provide `service`, `ThirdpartyId`, and `OfficeId` headers.
   *
   * @returns {Object}
   */
  getHeaders() {
    return {};
  }
}

export default BaseRequest;
