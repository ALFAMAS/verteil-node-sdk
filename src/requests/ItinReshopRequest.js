/**
 * @fileoverview Request class for the Verteil ItinReshop endpoint.
 *
 * Re-prices an itinerary after SEGMENT_CHANGE, ROUTING_CHANGE, or DATE_CHANGE,
 * with optional pricing qualifiers and corporate party.
 * Maps to `/entrygate/rest/request:itinReshop`.
 */



import BaseRequest from './BaseRequest.js';

const AIRLINE_RE   = /^[A-Z]{2}$/;
const AIRPORT_RE   = /^[A-Z]{3}$/;
const PNR_RE       = /^[A-Z0-9]{4,8}$/;
const FLIGHT_RE    = /^\d{1,4}[A-Z]?$/;
const DATE_RE      = /^\d{4}-\d{2}-\d{2}$/;

const VALID_CHANGE_TYPES     = ['SEGMENT_CHANGE', 'ROUTING_CHANGE', 'DATE_CHANGE'];
const VALID_QUALIFIER_TYPES  = ['FARE_BASIS', 'CABIN', 'BRAND'];
const VALID_CABINS           = ['F', 'C', 'J', 'Y'];
const VALID_PARTY_TYPES      = ['CORPORATE', 'TOUR', 'AGENCY'];

/**
 * @class ItinReshopRequest
 * @extends BaseRequest
 */
class ItinReshopRequest extends BaseRequest {
  /**
   * @param {Object}      orderId              `{ Owner, value }` — airline code and PNR.
   * @param {Array}       itineraryChanges     Array of change objects with `type` field.
   * @param {Array|null}  [pricingQualifiers]  FARE_BASIS / CABIN / BRAND qualifiers.
   * @param {Object|null} [party]              Corporate/agency party information.
   * @param {Object|null} [metadata]           NDC metadata block.
   * @param {string|null} [thirdPartyId]
   * @param {string|null} [officeId]
   */
  constructor(
    orderId,
    itineraryChanges,
    pricingQualifiers = null,
    party             = null,
    metadata          = null,
    thirdPartyId      = null,
    officeId          = null,
  ) {
    super({ third_party_id: thirdPartyId, office_id: officeId });
    this._orderId           = orderId;
    this._itineraryChanges  = itineraryChanges;
    this._pricingQualifiers = pricingQualifiers;
    this._party             = party;
    this._metadata          = metadata;
  }

  /** @returns {string} */
  getEndpoint() { return '/entrygate/rest/request:itinReshop'; }

  /** @returns {Object} */
  getHeaders() {
    return {
      service:      'ItinReshop',
      ThirdpartyId: this.data.third_party_id ?? null,
      OfficeId:     this.data.office_id      ?? null,
    };
  }

  /** @throws {Error} */
  validate() {
    this._validateOrderId();
    this._validateItineraryChanges();
    if (this._pricingQualifiers) this._validatePricingQualifiers();
    if (this._party)             this._validateParty();
  }

  /** @returns {Object} */
  toArray() {
    const query = {
      OrderID:           this._orderId,
      ItineraryChanges:  this._itineraryChanges.map(c => this._formatItineraryChange(c)),
    };
    if (this._pricingQualifiers) query.PricingQualifiers = this._formatPricingQualifiers();

    const data = { Query: query };
    if (this._party)    data.Party    = this._formatParty();
    if (this._metadata) data.Metadata = this._metadata;
    return data;
  }

  // ── Private validators ────────────────────────────────────────────────────

  /** @private */
  _validateOrderId() {
    if (!this._orderId?.Owner || !this._orderId?.value) {
      throw new Error('OrderID must contain Owner and value');
    }
    if (!AIRLINE_RE.test(this._orderId.Owner)) throw new Error('Invalid airline code format');
    if (!PNR_RE.test(this._orderId.value))     throw new Error('Invalid booking reference format');
  }

  /** @private */
  _validateItineraryChanges() {
    if (!Array.isArray(this._itineraryChanges) || !this._itineraryChanges.length) {
      throw new Error('At least one itinerary change is required');
    }
    for (const change of this._itineraryChanges) {
      if (!change.type) throw new Error('Change type is required');
      if (!VALID_CHANGE_TYPES.includes(change.type)) throw new Error('Invalid change type');
      switch (change.type) {
        case 'SEGMENT_CHANGE': this._validateSegmentChange(change); break;
        case 'ROUTING_CHANGE': this._validateRoutingChange(change); break;
        case 'DATE_CHANGE':    this._validateDateChange(change);    break;
      }
    }
  }

  /** @private */
  _validateSegmentChange(change) {
    if (!change.oldSegment || !change.newSegment) {
      throw new Error('Both old and new segment details are required');
    }
    this._validateSegmentDetails(change.oldSegment);
    this._validateSegmentDetails(change.newSegment);
  }

  /** @private */
  _validateRoutingChange(change) {
    if (!Array.isArray(change.newRouting) || !change.newRouting.length) {
      throw new Error('New routing details are required');
    }
    for (const seg of change.newRouting) this._validateSegmentDetails(seg);
  }

  /** @private */
  _validateDateChange(change) {
    if (!change.segmentRef || !change.newDate) {
      throw new Error('Segment reference and new date are required');
    }
    if (!DATE_RE.test(change.newDate)) {
      throw new Error('Invalid date format. Must be YYYY-MM-DD');
    }
  }

  /** @private */
  _validateSegmentDetails(seg) {
    for (const f of ['origin', 'destination', 'departure', 'airline', 'flightNumber']) {
      if (!seg[f]) throw new Error(`Missing required segment field: ${f}`);
    }
    if (!AIRPORT_RE.test(seg.origin) || !AIRPORT_RE.test(seg.destination)) {
      throw new Error('Invalid airport code format');
    }
    if (!AIRLINE_RE.test(seg.airline)) throw new Error('Invalid airline code format');
    if (!FLIGHT_RE.test(seg.flightNumber)) throw new Error('Invalid flight number format');
  }

  /** @private */
  _validatePricingQualifiers() {
    for (const q of this._pricingQualifiers) {
      if (!q.type) throw new Error('Qualifier type is required');
      if (!VALID_QUALIFIER_TYPES.includes(q.type)) throw new Error('Invalid qualifier type');
      switch (q.type) {
        case 'FARE_BASIS':
          if (!q.code) throw new Error('Fare basis code is required');
          break;
        case 'CABIN':
          if (!q.code || !VALID_CABINS.includes(q.code)) throw new Error('Invalid cabin code');
          break;
        case 'BRAND':
          if (!q.brandId) throw new Error('Brand ID is required');
          break;
      }
    }
  }

  /** @private */
  _validateParty() {
    if (!this._party.type || !this._party.code) {
      throw new Error('Party type and code are required');
    }
    if (!VALID_PARTY_TYPES.includes(this._party.type)) {
      throw new Error('Invalid party type');
    }
  }

  // ── Private formatters ────────────────────────────────────────────────────

  /** @private */
  _formatItineraryChange(change) {
    switch (change.type) {
      case 'SEGMENT_CHANGE': return this._formatSegmentChange(change);
      case 'ROUTING_CHANGE': return this._formatRoutingChange(change);
      case 'DATE_CHANGE':    return this._formatDateChange(change);
      default:               return {};
    }
  }

  /** @private */
  _formatSegmentChange(change) {
    return {
      Type:       'SEGMENT_CHANGE',
      OldSegment: this._formatSegmentDetails(change.oldSegment),
      NewSegment: this._formatSegmentDetails(change.newSegment),
    };
  }

  /** @private */
  _formatRoutingChange(change) {
    return {
      Type:       'ROUTING_CHANGE',
      NewRouting: change.newRouting.map(s => this._formatSegmentDetails(s)),
    };
  }

  /** @private */
  _formatDateChange(change) {
    return {
      Type:               'DATE_CHANGE',
      SegmentReference:   change.segmentRef,
      NewDepartureDate:   change.newDate,
      NewDepartureTime:   change.newTime ?? null,
    };
  }

  /** @private */
  _formatSegmentDetails(seg) {
    return {
      Departure: {
        AirportCode: { value: seg.origin },
        Date:        seg.departure.date,
        Time:        seg.departure.time ?? null,
      },
      Arrival: {
        AirportCode: { value: seg.destination },
        Date:        seg.arrival?.date ?? null,
        Time:        seg.arrival?.time ?? null,
      },
      MarketingCarrier: {
        AirlineID:    { value: seg.airline },
        FlightNumber: { value: seg.flightNumber },
      },
      OperatingCarrier: seg.operatingCarrier ? {
        AirlineID:    { value: seg.operatingCarrier.airline },
        FlightNumber: { value: seg.operatingCarrier.flightNumber },
      } : null,
      Equipment: seg.aircraft ? { AircraftCode: seg.aircraft } : null,
    };
  }

  /** @private */
  _formatPricingQualifiers() {
    return this._pricingQualifiers.map(q => {
      switch (q.type) {
        case 'FARE_BASIS': return { FareBasisCode: { Code: q.code } };
        case 'CABIN':      return { CabinType:     { Code: q.code } };
        case 'BRAND':      return { BrandID:       { value: q.brandId } };
        default:           return {};
      }
    });
  }

  /** @private */
  _formatParty() {
    return {
      Sender: {
        [`${this._party.type}Sender`]: {
          Code: this._party.code,
          Name: this._party.name ?? null,
          IATA: this._party.iata ? { value: this._party.iata } : null,
        },
      },
    };
  }
}

export default ItinReshopRequest;
