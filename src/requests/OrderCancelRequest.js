/**
 * @fileoverview Request class for the Verteil OrderCancel endpoint.
 *
 * Maps to `/entrygate/rest/request:orderCancel`.
 */



import BaseRequest from './BaseRequest.js';

const AIRLINE_RE  = /^[A-Z]{2}$/;
const PNR_RE      = /^[A-Z0-9]{4,8}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const VALID_CHANNELS = ['NDC', 'Direct_Connect'];

/**
 * @class OrderCancelRequest
 * @extends BaseRequest
 */
class OrderCancelRequest extends BaseRequest {
  /**
   * @param {Array}       orderId              Array of `{ Owner, value, Channel?, refs? }` objects.
   * @param {Object|null} [expectedRefundAmount] `{ Total: { value, Code } }`
   * @param {Object|null} [metadata]           NDC metadata block.
   * @param {string|null} [correlationId]      From a prior ItinReshop response.
   * @param {string|null} [thirdPartyId]
   * @param {string|null} [officeId]
   */
  constructor(
    orderId,
    expectedRefundAmount = null,
    metadata             = null,
    correlationId        = null,
    thirdPartyId         = null,
    officeId             = null,
  ) {
    super({ third_party_id: thirdPartyId, office_id: officeId });
    this._orderId              = orderId;
    this._expectedRefundAmount = expectedRefundAmount;
    this._metadata             = metadata;
    this._correlationId        = correlationId;
  }

  /** @returns {string} */
  getEndpoint() { return '/entrygate/rest/request:orderCancel'; }

  /** @returns {Object} */
  getHeaders() {
    return {
      service:      'OrderCancel',
      ThirdpartyId: this.data.third_party_id ?? null,
      OfficeId:     this.data.office_id      ?? null,
    };
  }

  /** @throws {Error} */
  validate() {
    this._validateOrderId();
    if (this._expectedRefundAmount) this._validateExpectedRefundAmount();
    if (this._metadata)             this._validateMetadata();
  }

  /** @returns {Object} */
  toArray() {
    const result = { Query: { OrderID: this._orderId } };
    if (this._expectedRefundAmount) result.ExpectedRefundAmount = this._expectedRefundAmount;
    if (this._metadata)             result.Metadata             = this._metadata;
    if (this._correlationId)        result.CorrelationID        = this._correlationId;
    return result;
  }

  // ── Private validators ────────────────────────────────────────────────────

  /** @private */
  _validateOrderId() {
    if (!Array.isArray(this._orderId) || !this._orderId.length) {
      throw new Error('OrderID is required');
    }
    for (const order of this._orderId) {
      if (!order.Owner || !order.value) throw new Error('OrderID must contain Owner and value');
      if (!AIRLINE_RE.test(order.Owner)) throw new Error('Invalid airline code in OrderID Owner');
      if (!PNR_RE.test(order.value))     throw new Error('Invalid PNR format in OrderID value');
      if (order.Channel && !VALID_CHANNELS.includes(order.Channel)) {
        throw new Error('Invalid channel in OrderID');
      }
    }
  }

  /** @private */
  _validateExpectedRefundAmount() {
    const total = this._expectedRefundAmount?.Total;
    if (!total?.value || !total?.Code) throw new Error('ExpectedRefundAmount Total must contain value and Code');
    if (total.value <= 0) throw new Error('ExpectedRefundAmount Total value must be positive');
    if (!CURRENCY_RE.test(total.Code)) throw new Error('Invalid currency code in ExpectedRefundAmount');
  }

  /** @private */
  _validateMetadata() {
    if (!this._metadata?.Other?.OtherMetadata) throw new Error('Invalid Metadata structure');
  }
}

export default OrderCancelRequest;
