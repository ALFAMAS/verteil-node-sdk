/**
 * @fileoverview Response class for the Verteil OrderView / OrderCreate endpoint.
 *
 * Parses the raw NDC JSON to surface order ID, booking references, passengers,
 * and pricing in a normalised structure.
 */



import BaseResponse from './BaseResponse.js';

/**
 * @class OrderViewResponse
 * @extends BaseResponse
 */
class OrderViewResponse extends BaseResponse {
  /**
   * @param {Object} data Raw NDC response body.
   */
  constructor(data) {
    super(data);
  }

  /**
   * Returns a normalised summary of the order response.
   * @returns {Object}
   */
  toArray() {
    if (!this.data) return {};
    return {
      success:           this.isSuccessful(),
      orderId:           this.getOrderId(),
      BookingReferences: this.getBookingReferences(),
      passengers:        this.getPassengers(),
      totalPrice:        this.getTotalPrice(),
      currency:          this.getCurrency(),
      response:          this.data.Response ?? null,
      errors:            this.getErrors(),
    };
  }

  /**
   * Returns `true` when no errors and an order ID is present.
   * @returns {boolean}
   */
  isSuccessful() {
    return this.getErrors().length === 0 && Boolean(this.getOrderId());
  }

  /**
   * Returns parsed error objects from the NDC Errors block.
   * @returns {Array<{code:string|null, short_text:string|null, message:string|null, owner:string|null, reason:string|null}>}
   */
  getErrors() {
    return (this.data?.Errors?.Error ?? []).map(e => ({
      code:       e.Code       ?? null,
      short_text: e.ShortText  ?? null,
      message:    e.value      ?? null,
      owner:      e.Owner      ?? null,
      reason:     e.Reason     ?? null,
    }));
  }

  /**
   * Returns the NDC order ID string.
   * @returns {string}
   */
  getOrderId() {
    return this.data?.Response?.Order?.[0]?.OrderID?.value ?? '';
  }

  /**
   * Returns GDS/airline booking references attached to the order.
   * @returns {Array}
   */
  getBookingReferences() {
    return this.data?.Response?.Order?.[0]?.BookingReferences?.BookingReference ?? [];
  }

  /**
   * Returns passengers attached to the order.
   * @returns {Array}
   */
  getPassengers() {
    return this.data?.Response?.Passengers?.Passenger ?? [];
  }

  /**
   * Returns the total order price as a float.
   * @returns {number}
   */
  getTotalPrice() {
    return this.data?.Response?.Order?.[0]?.TotalOrderPrice?.SimpleCurrencyPrice?.value ?? 0.0;
  }

  /**
   * Returns the 3-letter ISO currency code.
   * @returns {string}
   */
  getCurrency() {
    return this.data?.Response?.Order?.[0]?.TotalOrderPrice?.SimpleCurrencyPrice?.Code ?? '';
  }
}

export default OrderViewResponse;
