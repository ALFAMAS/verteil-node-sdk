/**
 * @fileoverview DataType builder for the Verteil OrderRetrieve endpoint.
 *
 * Constructs the NDC-compliant request payload used to fetch an existing order
 * by its airline-issued order identifier.
 */

/**
 * @class OrderRetrieve
 * @description Static factory for building OrderRetrieve request bodies.
 */
class OrderRetrieve {
  /**
   * Builds the top-level OrderRetrieve request object.
   *
   * @param {Object} [params={}]
   * @param {string}   params.owner   - Airline IATA code that owns the order.
   * @param {string}   params.orderId - PNR / order reference value.
   * @param {string}   [params.channel] - Distribution channel (e.g. 'NDC').
   * @param {string[]} [params.refs]   - Additional reference keys.
   * @returns {Object} OrderRetrieve NDC request body.
   */
  static create(params = {}) {
    return {
      Query: {
        Filters: {
          OrderID: OrderRetrieve._createOrderId(params),
        },
      },
    };
  }

  /**
   * @private
   * @param {Object} params
   * @returns {Object}
   */
  static _createOrderId(params) {
    const orderId = {
      Owner: params.owner,
      value: params.orderId,
    };

    if (params.channel != null) {
      orderId.Channel = params.channel;
    }

    if (Array.isArray(params.refs) && params.refs.length > 0) {
      orderId.refs = params.refs.map(ref => ({ Ref: ref }));
    }

    return orderId;
  }
}

export default OrderRetrieve;
