/**
 * @fileoverview Request class for the Verteil OrderChange endpoint.
 *
 * Supports FLIGHT_CHANGE, PASSENGER_INFO, ADD_SERVICE, and SEAT_CHANGE
 * modification types. Maps to `/entrygate/rest/request:orderChange`.
 */



import BaseRequest from './BaseRequest.js';

const AIRLINE_RE = /^[A-Z]{2}$/;
const PNR_RE     = /^[A-Z0-9]{4,8}$/;

const VALID_CHANGE_TYPES = ['FLIGHT_CHANGE', 'PASSENGER_INFO', 'ADD_SERVICE', 'SEAT_CHANGE'];

/**
 * @class OrderChangeRequest
 * @extends BaseRequest
 */
class OrderChangeRequest extends BaseRequest {
  /**
   * @param {Object}      orderId         `{ Owner, value }` — airline code and PNR.
   * @param {Array}       changes         Array of change descriptors with `type` field.
   * @param {Array|null}  [passengers]    Updated passenger information.
   * @param {Array|null}  [payments]      Payment info for additional charges.
   * @param {string|null} [correlationId] From a prior OrderReshop response.
   * @param {string|null} [thirdPartyId]
   * @param {string|null} [officeId]
   */
  constructor(
    orderId,
    changes,
    passengers    = null,
    payments      = null,
    correlationId = null,
    thirdPartyId  = null,
    officeId      = null,
  ) {
    super({ third_party_id: thirdPartyId, office_id: officeId });
    this._orderId        = orderId;
    this._changes        = changes;
    this._passengers     = passengers;
    this._payments       = payments;
    this._correlationId  = correlationId;
  }

  /** @returns {string} */
  getEndpoint() { return '/entrygate/rest/request:orderChange'; }

  /** @returns {Object} */
  getHeaders() {
    return {
      service:      'OrderChange',
      ThirdpartyId: this.data.third_party_id ?? null,
      OfficeId:     this.data.office_id      ?? null,
    };
  }

  /** @throws {Error} */
  validate() {
    this._validateOrderId();
    this._validateChanges();
    if (this._passengers) this._validatePassengers();
    if (this._payments)   this._validatePayments();
  }

  /** @returns {Object} */
  toArray() {
    const data = {
      Query: {
        OrderID: this._orderId,
        Changes: this._changes.map(c => this._formatChange(c)),
      },
    };
    if (this._passengers)    data.Passengers    = this._formatPassengers();
    if (this._payments)      data.Payments      = this._formatPayments();
    if (this._correlationId) data.CorrelationID = this._correlationId;
    return data;
  }

  // ── Private validators ────────────────────────────────────────────────────

  /** @private */
  _validateOrderId() {
    if (!this._orderId?.Owner || !this._orderId?.value) {
      throw new Error('OrderID must contain Owner and value');
    }
    if (!AIRLINE_RE.test(this._orderId.Owner)) throw new Error('Invalid airline code format in OrderID Owner');
    if (!PNR_RE.test(this._orderId.value))     throw new Error('Invalid PNR format in OrderID value');
  }

  /** @private */
  _validateChanges() {
    if (!Array.isArray(this._changes) || !this._changes.length) {
      throw new Error('At least one change is required');
    }
    for (const change of this._changes) {
      if (!change.type) throw new Error('Change type is required');
      if (!VALID_CHANGE_TYPES.includes(change.type)) throw new Error('Invalid change type');
      switch (change.type) {
        case 'FLIGHT_CHANGE':    this._validateFlightChange(change);         break;
        case 'PASSENGER_INFO':   this._validatePassengerInfoChange(change);  break;
        case 'ADD_SERVICE':      this._validateServiceChange(change);        break;
        case 'SEAT_CHANGE':      this._validateSeatChange(change);           break;
      }
    }
  }

  /** @private */
  _validateFlightChange(change) {
    if (!Array.isArray(change.segments) || !change.segments.length) {
      throw new Error('Flight segments are required for flight change');
    }
    for (const seg of change.segments) {
      if (!seg.origin || !seg.destination || !seg.departureDate || !seg.flightNumber) {
        throw new Error('Invalid flight segment structure');
      }
    }
  }

  /** @private */
  _validatePassengerInfoChange(change) {
    if (!change.passengerReference || !change.updates) {
      throw new Error('Passenger reference and updates are required');
    }
    for (const u of change.updates) {
      if (!u.field || !u.value) throw new Error('Invalid passenger update structure');
    }
  }

  /** @private */
  _validateServiceChange(change) {
    if (!change.serviceCode || !change.passengerReferences) {
      throw new Error('Service code and passenger references are required');
    }
  }

  /** @private */
  _validateSeatChange(change) {
    if (!change.segmentReference || !change.passengerReference || !change.seatNumber) {
      throw new Error('Invalid seat change structure');
    }
  }

  /** @private */
  _validatePassengers() {
    for (const p of this._passengers) {
      if (!p.reference || !p.type) throw new Error('Invalid passenger structure');
      if (p.document) this._validatePassengerDocument(p.document);
    }
  }

  /** @private */
  _validatePassengerDocument(doc) {
    for (const f of ['type', 'number', 'issuingCountry', 'expiryDate']) {
      if (!doc[f]) throw new Error(`Missing required document field: ${f}`);
    }
  }

  /** @private */
  _validatePayments() {
    for (const payment of this._payments) {
      if (!payment.amount || !payment.currency) throw new Error('Invalid payment structure');
      if (payment.card) this._validatePaymentCard(payment.card);
    }
  }

  /** @private */
  _validatePaymentCard(card) {
    for (const f of ['number', 'expiryDate', 'securityCode', 'holderName']) {
      if (!card[f]) throw new Error(`Missing required card field: ${f}`);
    }
  }

  // ── Private formatters ────────────────────────────────────────────────────

  /** @private */
  _formatChange(change) {
    switch (change.type) {
      case 'FLIGHT_CHANGE':  return this._formatFlightChange(change);
      case 'PASSENGER_INFO': return this._formatPassengerInfoChange(change);
      case 'ADD_SERVICE':    return this._formatServiceChange(change);
      case 'SEAT_CHANGE':    return this._formatSeatChange(change);
      default:               return {};
    }
  }

  /** @private */
  _formatFlightChange(change) {
    return {
      ChangeType: 'FLIGHT_CHANGE',
      Segments: change.segments.map(seg => ({
        Departure: {
          AirportCode: { value: seg.origin },
          Date: seg.departureDate,
          Time: seg.departureTime ?? null,
        },
        Arrival: { AirportCode: { value: seg.destination } },
        MarketingCarrier: {
          AirlineID:    { value: seg.airlineCode },
          FlightNumber: { value: seg.flightNumber },
        },
      })),
    };
  }

  /** @private */
  _formatPassengerInfoChange(change) {
    return {
      ChangeType:         'PASSENGER_INFO',
      PassengerReference: change.passengerReference,
      Updates: change.updates.map(u => ({ Field: u.field, Value: u.value })),
    };
  }

  /** @private */
  _formatServiceChange(change) {
    return {
      ChangeType:          'ADD_SERVICE',
      ServiceCode:         change.serviceCode,
      PassengerReferences: change.passengerReferences,
    };
  }

  /** @private */
  _formatSeatChange(change) {
    return {
      ChangeType:          'SEAT_CHANGE',
      SegmentReference:    change.segmentReference,
      PassengerReference:  change.passengerReference,
      SeatNumber:          change.seatNumber,
    };
  }

  /** @private */
  _formatPassengers() {
    return {
      Passenger: this._passengers.map(p => ({
        ObjectKey: p.reference,
        PTC:       { value: p.type },
        PassengerIDInfo: p.document ? {
          PassengerDocument: [{
            Type:              p.document.type,
            ID:                p.document.number,
            CountryOfIssuance: p.document.issuingCountry,
            DateOfExpiration:  p.document.expiryDate,
          }],
        } : null,
      })),
    };
  }

  /** @private */
  _formatPayments() {
    return {
      Payment: this._payments.map(payment => ({
        Amount: { value: payment.amount, Code: payment.currency },
        Method: payment.card ? {
          PaymentCard: {
            CardNumber:            { value: payment.card.number },
            SeriesCode:            { value: payment.card.securityCode },
            CardHolderName:        { value: payment.card.holderName },
            EffectiveExpireDate:   { value: payment.card.expiryDate },
          },
        } : null,
      })),
    };
  }
}

export default OrderChangeRequest;
