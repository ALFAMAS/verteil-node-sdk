/**
 * @fileoverview Abstract base class for all Verteil API response objects.
 *
 * Concrete response classes extend this and layer typed accessor methods
 * over the raw NDC JSON payload.
 */

/**
 * @class BaseResponse
 * @abstract
 */
class BaseResponse {
  /**
   * @param {Object} data Raw NDC JSON response body.
   */
  constructor(data) {
    if (new.target === BaseResponse) {
      throw new Error('BaseResponse is abstract and cannot be instantiated directly');
    }
    /** @protected @type {Object} */
    this.data = data;
  }

  /**
   * Returns the raw response data as a plain object.
   * @returns {Object}
   */
  toArray() {
    return this.data;
  }
}

export default BaseResponse;
