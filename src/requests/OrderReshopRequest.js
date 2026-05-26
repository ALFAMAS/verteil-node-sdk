/**
 * @fileoverview Request class for the Verteil OrderReshop endpoint.
 *
 * Used to re-price an existing order, optionally with cabin, fare, or service
 * qualifiers and alternative-date search.
 * Maps to `/entrygate/rest/request:orderReshop`.
 */



import BaseRequest from './BaseRequest.js';

const AIRLINE_RE         = /^[A-Z]{2}$/;
const PNR_RE             = /^[A-Z0-9]{4,8}$/;
const VALID_QUALIFIER_TYPES = ['CABIN', 'FARE', 'SERVICE'];
const VALID_CABINS       = ['F', 'C', 'J', 'S', 'Y', 'M'];

/**
 * @class OrderReshopRequest
 * @extends BaseRequest
 */
class OrderReshopRequest extends BaseRequest {
  /**
   * @param {Object}       orderId               `{ Owner, value }` — airline code and PNR.
   * @param {Array|null}   [qualifiers]           CABIN/FARE/SERVICE qualifier objects.
   * @param {Array|null}   [segments]             Specific segments to reshop.
   * @param {Array|null}   [passengerRefs]        Passenger references for partial reshop.
   * @param {boolean|null} [searchAlternateDates] Whether to include ±3-day date alternatives.
   * @param {string|null}  [thirdPartyId]
   * @param {string|null}  [officeId]
   */
  constructor(
    orderId,
    qualifiers           = null,
    segments             = null,
    passengerRefs        = null,
    searchAlternateDates = null,
    thirdPartyId         = null,
    officeId             = null,
  ) {
    super({ third_party_id: thirdPartyId, office_id: officeId });
    this._orderId              = orderId;
    this._qualifiers           = qualifiers;
    this._segments             = segments;
    this._passengerRefs        = passengerRefs;
    this._searchAlternateDates = searchAlternateDates;
  }

  /** @returns {string} */
  getEndpoint() { return '/entrygate/rest/request:orderReshop'; }

  /** @returns {Object} */
  getHeaders() {
    return {
      service:      'OrderReshop',
      ThirdpartyId: this.data.third_party_id ?? null,
      OfficeId:     this.data.office_id      ?? null,
    };
  }

  /** @throws {Error} */
  validate() {
    this._validateOrderId();
    if (this._qualifiers)    this._validateQualifiers();
    if (this._segments)      this._validateSegments();
    if (this._passengerRefs) this._validatePassengerRefs();
  }

  /** @returns {Object} */
  toArray() {
    const query = { OrderID: this._orderId };
    if (this._qualifiers)           query.Qualifiers         = this._formatQualifiers();
    if (this._segments)             query.Segments           = this._formatSegments();
    if (this._passengerRefs)        query.PassengerRefs      = this._formatPassengerRefs();
    if (this._searchAlternateDates != null) {
      query.SearchAlternateDates = this._searchAlternateDates;
    }
    return { Query: query };
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
  _validateQualifiers() {
    for (const q of this._qualifiers) {
      if (!q.type) throw new Error('Qualifier type is required');
      if (!VALID_QUALIFIER_TYPES.includes(q.type)) throw new Error('Invalid qualifier type');
      switch (q.type) {
        case 'CABIN':   this._validateCabinQualifier(q);   break;
        case 'FARE':    this._validateFareQualifier(q);    break;
        case 'SERVICE': this._validateServiceQualifier(q); break;
      }
    }
  }

  /** @private */
  _validateCabinQualifier(q) {
    if (!q.cabin) throw new Error('Cabin preference is required');
    if (!VALID_CABINS.includes(q.cabin)) throw new Error('Invalid cabin code');
  }

  /** @private */
  _validateFareQualifier(q) {
    if (!q.fareBasis) throw new Error('Fare basis code is required');
  }

  /** @private */
  _validateServiceQualifier(q) {
    if (!q.serviceCode) throw new Error('Service code is required');
  }

  /** @private */
  _validateSegments() {
    for (const seg of this._segments) {
      if (!seg.segmentKey) throw new Error('Segment key is required');
      if (seg.newFlight) this._validateFlightDetails(seg.newFlight);
    }
  }

  /** @private */
  _validateFlightDetails(flight) {
    for (const f of ['origin', 'destination', 'departureDate', 'airlineCode', 'flightNumber']) {
      if (!flight[f]) throw new Error(`Missing required flight field: ${f}`);
    }
  }

  /** @private */
  _validatePassengerRefs() {
    if (!this._passengerRefs.length) throw new Error('At least one passenger reference is required');
    for (const ref of this._passengerRefs) {
      if (!ref.value) throw new Error('Invalid passenger reference format');
    }
  }

  // ── Private formatters ────────────────────────────────────────────────────

  /** @private */
  _formatQualifiers() {
    return this._qualifiers.map(q => {
      switch (q.type) {
        case 'CABIN':
          return { CabinPreference: { CabinType: { Code: q.cabin } } };
        case 'FARE':
          return {
            FarePreference: {
              FareBasisCode:   { Code: q.fareBasis },
              PreferenceLevel: q.preferenceLevel ?? null,
            },
          };
        case 'SERVICE':
          return {
            ServicePreference: {
              ServiceCode:          q.serviceCode,
              ServiceDefinitionID:  q.serviceDefinitionId ?? null,
            },
          };
        default:
          return {};
      }
    });
  }

  /** @private */
  _formatSegments() {
    return this._segments.map(seg => {
      const out = { SegmentKey: seg.segmentKey };
      if (seg.newFlight) {
        out.NewFlight = {
          Departure: {
            AirportCode: { value: seg.newFlight.origin },
            Date:        seg.newFlight.departureDate,
            Time:        seg.newFlight.departureTime ?? null,
          },
          Arrival: {
            AirportCode: { value: seg.newFlight.destination },
            Date:        seg.newFlight.arrivalDate ?? null,
            Time:        seg.newFlight.arrivalTime ?? null,
          },
          MarketingCarrier: {
            AirlineID:    { value: seg.newFlight.airlineCode },
            FlightNumber: { value: seg.newFlight.flightNumber },
          },
        };
      }
      return out;
    });
  }

  /** @private */
  _formatPassengerRefs() {
    return this._passengerRefs.map(ref => ({ value: ref.value }));
  }
}

export default OrderReshopRequest;
