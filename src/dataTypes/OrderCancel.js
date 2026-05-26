/**
 * @fileoverview DataType builder for the Verteil OrderCancel endpoint.
 *
 * Constructs the NDC-compliant cancellation request, including optional
 * expected-refund amounts and metadata blocks.
 */

/**
 * @class OrderCancel
 * @description Static factory for building OrderCancel request bodies.
 */
class OrderCancel {
  /**
   * Builds the top-level OrderCancel request object.
   *
   * @param {Object} [params={}]
   * @param {Array<{owner:string, orderId:string, channel?:string, refs?:string[]}>} params.orders
   *   Array of order identifiers to cancel.
   * @param {{amount:number, currency:string}} [params.expectedRefundAmount]
   *   Expected refund total.
   * @param {Array<Object>} [params.metadata] - Optional metadata blocks.
   * @param {string} [params.correlationId]   - Client correlation identifier.
   * @returns {Object} OrderCancel NDC request body.
   */
  static create(params = {}) {
    const request = {
      Query: {
        OrderID: OrderCancel._createOrderIds(params.orders ?? []),
      },
    };

    if (params.expectedRefundAmount != null) {
      request.ExpectedRefundAmount = OrderCancel._createRefundAmount(params.expectedRefundAmount);
    }

    if (params.metadata != null) {
      request.Metadata = OrderCancel._createMetadata(params.metadata);
    }

    if (params.correlationId != null) {
      request.CorrelationID = params.correlationId;
    }

    return request;
  }

  /**
   * @private
   * @param {Array} orders
   * @returns {Array}
   */
  static _createOrderIds(orders) {
    return orders.map(order => {
      const orderId = {
        Owner: order.owner,
        value: order.orderId,
      };

      if (order.channel != null) {
        orderId.Channel = order.channel;
      }

      if (Array.isArray(order.refs) && order.refs.length > 0) {
        orderId.refs = order.refs.map(ref => ({ Ref: { value: ref } }));
      }

      return orderId;
    });
  }

  /**
   * @private
   * @param {{amount:number, currency:string}} refund
   * @returns {Object}
   */
  static _createRefundAmount(refund) {
    return {
      Total: {
        value: refund.amount,
        Code:  refund.currency,
      },
    };
  }

  /**
   * @private
   * @param {Array<Object>} metadata
   * @returns {Object}
   */
  static _createMetadata(metadata) {
    return {
      Other: {
        OtherMetadata: metadata.map(meta => {
          const item = {};

          if (Array.isArray(meta.priceMetadata)) {
            item.PriceMetadatas = {
              PriceMetadata: meta.priceMetadata.map(price => ({
                AugmentationPoint: {
                  AugPoint: price.augmentationPoint,
                },
                MetadataKey: price.key,
              })),
            };
          }

          if (Array.isArray(meta.currencyMetadata)) {
            item.CurrencyMetadatas = {
              CurrencyMetadata: meta.currencyMetadata.map(currency => ({
                MetadataKey: currency.key,
                Decimals:    currency.decimals,
              })),
            };
          }

          return item;
        }),
      },
    };
  }
}

export default OrderCancel;
