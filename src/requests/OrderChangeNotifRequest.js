/**
 * @fileoverview Request class for the Verteil OrderChangeNotif endpoint.
 *
 * Sends schedule-change notifications (SCHEDULE_CHANGE, FLIGHT_CANCEL,
 * ROUTE_CHANGE, AIRCRAFT_CHANGE) and optional alternative offers.
 * Maps to `/entrygate/rest/request:orderChangeNotif`.
 */



import BaseRequest from './BaseRequest.js';

const AIRLINE_RE  = /^[A-Z]{2}$/;
const AIRPORT_RE  = /^[A-Z]{3}$/;
const PNR_RE      = /^[A-Z0-9]{4,8}$/;
const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/;

const VALID_NOTIF_TYPES      = ['SCHEDULE_CHANGE', 'FLIGHT_CANCEL', 'ROUTE_CHANGE', 'AIRCRAFT_CHANGE'];
const VALID_SEVERITY         = ['INFO', 'WARNING', 'CRITICAL'];
const VALID_IMPACT_STATUS    = ['AFFECTED', 'CANCELLED', 'MODIFIED'];
const VALID_ALT_TYPES        = ['REROUTE', 'RESCHEDULE', 'REFUND'];

/**
 * @class OrderChangeNotifRequest
 * @extends BaseRequest
 */
class OrderChangeNotifRequest extends BaseRequest {
  /**
   * @param {Object}      orderId          `{ Owner, value }` — airline code and PNR.
   * @param {Object}      notification     `{ type, reason, severity?, affectedSegments?, description?, timestamp? }`.
   * @param {Array|null}  [serviceImpact]  Services affected by the change.
   * @param {Array|null}  [alternatives]   Re-accommodation options offered.
   * @param {string|null} [thirdPartyId]
   * @param {string|null} [officeId]
   */
  constructor(
    orderId,
    notification,
    serviceImpact = null,
    alternatives  = null,
    thirdPartyId  = null,
    officeId      = null,
  ) {
    super({ third_party_id: thirdPartyId, office_id: officeId });
    this._orderId       = orderId;
    this._notification  = notification;
    this._serviceImpact = serviceImpact;
    this._alternatives  = alternatives;
  }

  /** @returns {string} */
  getEndpoint() { return '/entrygate/rest/request:orderChangeNotif'; }

  /** @returns {Object} */
  getHeaders() {
    return {
      service:      'OrderChangeNotif',
      ThirdpartyId: this.data.third_party_id ?? null,
      OfficeId:     this.data.office_id      ?? null,
    };
  }

  /** @throws {Error} */
  validate() {
    this._validateOrderId();
    this._validateNotification();
    if (this._serviceImpact) this._validateServiceImpact();
    if (this._alternatives)  this._validateAlternatives();
  }

  /** @returns {Object} */
  toArray() {
    const query = {
      OrderID:      this._orderId,
      Notification: this._formatNotification(),
    };
    if (this._serviceImpact) query.ServiceImpact = this._formatServiceImpact();
    if (this._alternatives)  query.Alternatives  = this._formatAlternatives();
    return { Query: query };
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
  _validateNotification() {
    if (!this._notification.type || !this._notification.reason) {
      throw new Error('Notification must contain type and reason');
    }
    if (!VALID_NOTIF_TYPES.includes(this._notification.type)) {
      throw new Error('Invalid notification type');
    }
    if (this._notification.severity && !VALID_SEVERITY.includes(this._notification.severity)) {
      throw new Error('Invalid severity level');
    }
    if (this._notification.affectedSegments) {
      for (const seg of this._notification.affectedSegments) {
        if (!seg.segmentRef) throw new Error('Affected segments must contain segment reference');
      }
    }
  }

  /** @private */
  _validateServiceImpact() {
    for (const impact of this._serviceImpact) {
      if (!impact.serviceType || !impact.status) {
        throw new Error('Service impact must contain serviceType and status');
      }
      if (!VALID_IMPACT_STATUS.includes(impact.status)) {
        throw new Error('Invalid service impact status');
      }
    }
  }

  /** @private */
  _validateAlternatives() {
    for (const alt of this._alternatives) {
      if (!alt.type || !alt.segments) {
        throw new Error('Alternative must contain type and segments');
      }
      if (!VALID_ALT_TYPES.includes(alt.type)) {
        throw new Error('Invalid alternative type');
      }
      for (const seg of alt.segments) this._validateSegmentDetails(seg);
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
    if (!seg.departure.date || !DATE_RE.test(seg.departure.date)) {
      throw new Error('Invalid departure date format');
    }
  }

  // ── Private formatters ────────────────────────────────────────────────────

  /** @private */
  _formatNotification() {
    const notif = {
      Type:        this._notification.type,
      Reason:      this._notification.reason,
      Severity:    this._notification.severity    ?? 'INFO',
      Description: this._notification.description ?? null,
      Timestamp:   this._notification.timestamp   ?? new Date().toISOString(),
    };
    if (this._notification.affectedSegments) {
      notif.AffectedSegments = this._notification.affectedSegments.map(seg => ({
        SegmentRef:  seg.segmentRef,
        ImpactType:  seg.impactType  ?? null,
        Description: seg.description ?? null,
      }));
    }
    return notif;
  }

  /** @private */
  _formatServiceImpact() {
    return this._serviceImpact.map(impact => ({
      ServiceType:  impact.serviceType,
      Status:       impact.status,
      Description:  impact.description ?? null,
      ServiceRef:   impact.serviceRef  ?? null,
    }));
  }

  /** @private */
  _formatAlternatives() {
    return this._alternatives.map(alt => ({
      Type:        alt.type,
      Description: alt.description ?? null,
      ValidityPeriod: alt.validity ? {
        StartDate: alt.validity.start,
        EndDate:   alt.validity.end,
      } : null,
      Segments: alt.segments
        ? alt.segments.map(s => this._formatSegmentDetails(s))
        : null,
      PriceDifference: alt.priceDifference ? {
        Amount: {
          value: alt.priceDifference.amount,
          Code:  alt.priceDifference.currency,
        },
      } : null,
    }));
  }

  /** @private */
  _formatSegmentDetails(seg) {
    return {
      Departure: {
        AirportCode: { value: seg.origin },
        Date:        seg.departure.date,
        Time:        seg.departure.time ?? null,
        Terminal:    seg.departure.terminal ? { Name: seg.departure.terminal } : null,
      },
      Arrival: {
        AirportCode: { value: seg.destination },
        Date:        seg.arrival?.date ?? null,
        Time:        seg.arrival?.time ?? null,
        Terminal:    seg.arrival?.terminal ? { Name: seg.arrival.terminal } : null,
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
}

export default OrderChangeNotifRequest;
