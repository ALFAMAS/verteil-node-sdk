/**
 * @fileoverview Response class for the Verteil OrderChange endpoint.
 *
 * Parses order ID, status, change fees, modified segments, added services,
 * updated passengers, and ticketing deadlines from the raw NDC response.
 */



import BaseResponse from './BaseResponse.js';

/**
 * @class OrderChangeResponse
 * @extends BaseResponse
 */
class OrderChangeResponse extends BaseResponse {
  /**
   * @param {Object} data Raw NDC response body.
   */
  constructor(data) {
    super(data);
  }

  /**
   * Returns the NDC order ID string.
   * @returns {string}
   */
  getOrderId() {
    return this.data?.Response?.Order?.[0]?.OrderID?.value ?? '';
  }

  /**
   * Returns the order status string (e.g. `'CONFIRMED'`, `'PENDING'`).
   * @returns {string}
   */
  getStatus() {
    return this.data?.Response?.Order?.[0]?.OrderStatus ?? '';
  }

  /**
   * Returns all change fees applied to the order.
   * @returns {Array<{amount:number, currency:string, type:string, description:string}>}
   */
  getChangeFees() {
    return (this.data?.Response?.Order?.[0]?.ChangeFees ?? []).map(fee => ({
      amount:      fee?.Amount?.value ?? 0.0,
      currency:    fee?.Amount?.Code  ?? '',
      type:        fee.Type           ?? '',
      description: fee.Description    ?? '',
    }));
  }

  /**
   * Returns the post-change total order price.
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

  /**
   * Returns modified flight segments from the OrderItems list.
   * @returns {Array<{segmentKey:string, status:string, departure:Object, arrival:Object}>}
   */
  getModifiedSegments() {
    const segments = [];
    for (const item of this.data?.Response?.Order?.[0]?.OrderItems ?? []) {
      if (item.FlightItem) {
        segments.push({
          segmentKey: item.FlightItem.SegmentKey ?? '',
          status:     item.FlightItem.Status     ?? '',
          departure: {
            airport: item.FlightItem.Departure?.AirportCode?.value ?? '',
            date:    item.FlightItem.Departure?.Date               ?? '',
            time:    item.FlightItem.Departure?.Time               ?? '',
          },
          arrival: {
            airport: item.FlightItem.Arrival?.AirportCode?.value ?? '',
            date:    item.FlightItem.Arrival?.Date               ?? '',
            time:    item.FlightItem.Arrival?.Time               ?? '',
          },
        });
      }
    }
    return segments;
  }

  /**
   * Returns ancillary services added as part of the change.
   * @returns {Array<{serviceId:string, status:string, description:string, price:Object}>}
   */
  getAddedServices() {
    const services = [];
    for (const item of this.data?.Response?.Order?.[0]?.OrderItems ?? []) {
      if (item.ServiceItem) {
        services.push({
          serviceId:   item.ServiceItem.ServiceID           ?? '',
          status:      item.ServiceItem.Status              ?? '',
          description: item.ServiceItem.ServiceDescription  ?? '',
          price: {
            amount:   item.ServiceItem.Price?.Amount?.value ?? 0.0,
            currency: item.ServiceItem.Price?.Amount?.Code  ?? '',
          },
        });
      }
    }
    return services;
  }

  /**
   * Returns updated passenger details from the DataLists.
   * @returns {Array<{reference:string, type:string, name:Object, contact:Object|null, documents:Array}>}
   */
  getUpdatedPassengers() {
    return (this.data?.Response?.DataLists?.PassengerList ?? []).map(p => ({
      reference: p.PassengerReference ?? '',
      type:      p.PassengerType      ?? '',
      name: {
        given:   p.Name?.Given   ?? '',
        surname: p.Name?.Surname ?? '',
      },
      contact: p.Contact ? {
        email: p.Contact.EmailAddress?.value ?? '',
        phone: p.Contact.Phone?.Number       ?? '',
      } : null,
      documents: (p.Documents ?? []).map(doc => ({
        type:           doc.Type           ?? '',
        number:         doc.Number         ?? '',
        issuingCountry: doc.IssuingCountry ?? '',
        expiryDate:     doc.ExpiryDate     ?? '',
      })),
    }));
  }

  /**
   * Returns non-critical warnings from the response.
   * @returns {Array<{code:string, message:string, type:string}>}
   */
  getWarnings() {
    return (this.data?.Response?.Warnings ?? []).map(w => ({
      code:    w.Code    ?? '',
      message: w.Message ?? '',
      type:    w.Type    ?? '',
    }));
  }

  /**
   * Returns the ticketing deadline for this order, if set.
   * @returns {string|null}
   */
  getTicketingDeadline() {
    return this.data?.Response?.Order?.[0]?.TicketingDeadline ?? null;
  }

  /**
   * Returns the GDS PNR locator from booking references, if present.
   * @returns {string|null}
   */
  getPnrLocator() {
    for (const ref of this.data?.Response?.Order?.[0]?.BookingReferences ?? []) {
      if (ref.Type === 'PNR') return ref.ID ?? null;
    }
    return null;
  }
}

export default OrderChangeResponse;
