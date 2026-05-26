/**
 * @fileoverview Request class for the Verteil OrderRetrieve endpoint.
 *
 * Looks up an existing order by PNR/booking reference and airline owner code.
 * Maps to `/entrygate/rest/request:orderRetrieve`.
 */



import BaseRequest from './BaseRequest.js';

const AIRLINE_RE  = /^[A-Z]{2}$/;
const PNR_RE      = /^[A-Z0-9]{4,8}$/;
const VALID_CHANNELS = ['NDC', 'Direct_Connect'];

/**
 * Constructs and validates an OrderRetrieve request.
 *
 * @class OrderRetrieveRequest
 * @extends BaseRequest
 */
class OrderRetrieveRequest extends BaseRequest {
  /**
   * @param {Object} params
   * @param {Object} params.Query
   * @param {Object} params.Query.Filters
   * @param {Object} params.Query.Filters.OrderID
   */
  constructor(params) {
    super({});

    const orderID = params?.Query?.Filters?.OrderID ?? {};

    /** @type {string|null} IATA airline code of the order owner. */
    this.owner   = orderID.Owner   ?? null;
    /** @type {string|null} PNR / booking reference. */
    this.value   = orderID.value   ?? null;
    /** @type {string|null} Channel (NDC or Direct_Connect). */
    this.channel = orderID.Channel ?? null;
    /** @private */
    this._filters = params?.Query?.Filters ?? {};
    /** @private */
    this._officeId = params?.officeId ?? null;
  }

  /** @returns {string} */
  getEndpoint() { return '/entrygate/rest/request:orderRetrieve'; }

  /** @returns {Object} */
  getHeaders() {
    return {
      service:      'OrderRetrieve',
      ThirdpartyId: this.owner,
      OfficeId:     this._officeId,
    };
  }

  /**
   * @throws {Error}
   */
  validate() {
    this._validateOwner();
    this._validateValue();
    this._validateChannel();
  }

  /** @returns {Object} */
  toArray() {
    const orderID = {};
    if (this.owner)   orderID.Owner   = this.owner;
    if (this.value)   orderID.value   = this.value;
    if (this.channel) orderID.Channel = this.channel;

    return {
      Query: {
        Filters: { ...this._filters, OrderID: orderID },
      },
    };
  }

  // ── Private validators ────────────────────────────────────────────────────

  /** @private */
  _validateOwner() {
    if (!this.owner) throw new Error('Owner (Airline code) is required');
    if (!AIRLINE_RE.test(this.owner)) throw new Error('Invalid airline code format');
  }

  /** @private */
  _validateValue() {
    if (!this.value) throw new Error('PNR/Booking reference is required');
    if (!PNR_RE.test(this.value)) throw new Error('Invalid PNR format (4-8 alphanumeric characters)');
  }

  /** @private */
  _validateChannel() {
    if (this.channel && !VALID_CHANNELS.includes(this.channel)) {
      throw new Error(`Invalid channel. Must be one of: ${VALID_CHANNELS.join(', ')}`);
    }
  }
}

export default OrderRetrieveRequest;
