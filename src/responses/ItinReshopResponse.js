/**
 * @fileoverview Response class for the Verteil ItinReshop endpoint.
 *
 * Parses the full re-itinerary reshop result: options with pricing, penalties,
 * change fees, fare basis, and reference data lists.
 */



import BaseResponse from './BaseResponse.js';

/**
 * @class ItinReshopResponse
 * @extends BaseResponse
 */
class ItinReshopResponse extends BaseResponse {
  /**
   * @param {Object} data Raw NDC response body.
   */
  constructor(data) {
    super(data);
  }

  /**
   * Returns the NDC correlation ID that links back to the ItinReshop request.
   * @returns {string}
   */
  getCorrelationId() {
    return this.data?.Response?.CorrelationID ?? '';
  }

  /**
   * Returns the full reshop results block: responseId, options, penalties, and expiry.
   * @returns {{responseId:string, options:Array, penalties:Array, expirationDateTime:string|null}}
   */
  getReshopResults() {
    if (!this.data?.Response?.ReshopResults) return {};
    return {
      responseId:          this.data.Response.ReshopResults.ResponseID?.value   ?? '',
      options:             this._extractReshopOptions(),
      penalties:           this._extractPenalties(),
      expirationDateTime:  this.data.Response.ReshopResults.ExpirationDateTime  ?? null,
    };
  }

  /**
   * Returns reference data lists (airports, airlines, equipment).
   * @returns {{airports:Array, airlines:Array, equipment:Array}}
   */
  getDataLists() {
    return {
      airports:  this._extractAirports(),
      airlines:  this._extractAirlines(),
      equipment: this._extractEquipment(),
    };
  }

  /**
   * Returns non-critical warnings.
   * @returns {Array<{code:string, type:string, description:string, severity:string}>}
   */
  getWarnings() {
    return (this.data?.Response?.Warnings ?? []).map(w => ({
      code:        w.Code        ?? '',
      type:        w.Type        ?? '',
      description: w.Description ?? '',
      severity:    w.Severity    ?? 'Info',
    }));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  _extractReshopOptions() {
    return (this.data?.Response?.ReshopResults?.ReshopOptions ?? []).map(opt => ({
      optionId:  opt.OptionID?.value ?? '',
      segments:  this._extractSegments(opt.Segments ?? []),
      pricing: {
        original:   this._extractPrice(opt.OriginalPrice    ?? {}),
        new:        this._extractPrice(opt.NewPrice         ?? {}),
        difference: this._extractPrice(opt.PriceDifference  ?? {}),
        changeFees: this._extractChangeFees(opt.ChangeFees  ?? []),
      },
      availability: {
        status: opt.AvailabilityStatus ?? '',
        seats:  opt.AvailableSeats     ?? null,
      },
      fareBasis:         this._extractFareBasis(opt.FareBasis ?? {}),
      validatingCarrier: opt.ValidatingCarrier?.AirlineID?.value ?? '',
    }));
  }

  /** @private */
  _extractSegments(segments) {
    return segments.map(seg => ({
      segmentKey: seg.SegmentKey ?? '',
      status:     seg.Status     ?? '',
      departure: {
        airport:  seg.Departure?.AirportCode?.value  ?? '',
        terminal: seg.Departure?.Terminal?.Name       ?? null,
        date:     seg.Departure?.Date                 ?? '',
        time:     seg.Departure?.Time                 ?? '',
      },
      arrival: {
        airport:  seg.Arrival?.AirportCode?.value    ?? '',
        terminal: seg.Arrival?.Terminal?.Name         ?? null,
        date:     seg.Arrival?.Date                   ?? '',
        time:     seg.Arrival?.Time                   ?? '',
      },
      marketing: {
        airline:      seg.MarketingCarrier?.AirlineID?.value    ?? '',
        flightNumber: seg.MarketingCarrier?.FlightNumber?.value ?? '',
      },
      operating: seg.OperatingCarrier ? {
        airline:      seg.OperatingCarrier.AirlineID?.value    ?? '',
        flightNumber: seg.OperatingCarrier.FlightNumber?.value ?? '',
      } : null,
      equipment: {
        aircraftCode: seg.Equipment?.AircraftCode ?? null,
        aircraftName: seg.Equipment?.Name         ?? null,
      },
      cabinType: {
        code: seg.CabinType?.Code       ?? null,
        name: seg.CabinType?.Definition ?? null,
      },
      duration: seg.JourneyDuration ?? null,
      stops:    this._extractStops(seg.Stops ?? []),
      baggage:  this._extractBaggageAllowance(seg.BaggageAllowance ?? {}),
    }));
  }

  /** @private */
  _extractStops(stops) {
    return stops.map(stop => ({
      airport:       stop.AirportCode?.value ?? '',
      duration:      stop.Duration           ?? null,
      arrivalTime:   stop.ArrivalTime        ?? null,
      departureTime: stop.DepartureTime      ?? null,
    }));
  }

  /** @private */
  _extractBaggageAllowance(baggage) {
    return {
      quantity: baggage.Quantity ?? null,
      weight: baggage.Weight ? {
        value: baggage.Weight.Value ?? null,
        unit:  baggage.Weight.Unit  ?? null,
      } : null,
      type: baggage.Type ?? null,
    };
  }

  /** @private */
  _extractPrice(price) {
    return {
      totalAmount: {
        value:    price.TotalAmount?.value ?? 0.0,
        currency: price.TotalAmount?.Code  ?? '',
      },
      baseAmount: {
        value:    price.BaseAmount?.value ?? 0.0,
        currency: price.BaseAmount?.Code  ?? '',
      },
      taxes: (price.Taxes?.Tax ?? []).map(t => ({
        code: t.TaxCode ?? '',
        amount: {
          value:    t.Amount?.value ?? 0.0,
          currency: t.Amount?.Code  ?? '',
        },
        description: t.Description ?? null,
      })),
      fees: (price.Fees?.Fee ?? []).map(f => ({
        code: f.FeeCode ?? '',
        amount: {
          value:    f.Amount?.value ?? 0.0,
          currency: f.Amount?.Code  ?? '',
        },
        description: f.Description ?? null,
      })),
    };
  }

  /** @private */
  _extractChangeFees(fees) {
    return fees.map(fee => ({
      type:          fee.Type          ?? '',
      amount: {
        value:    fee.Amount?.value    ?? 0.0,
        currency: fee.Amount?.Code     ?? '',
      },
      description:   fee.Description   ?? null,
      applicability: fee.Applicability ?? null,
      restrictions:  this._extractRestrictions(fee.Restrictions ?? []),
    }));
  }

  /** @private */
  _extractRestrictions(restrictions) {
    return restrictions.map(r => ({
      type:          r.Type         ?? '',
      description:   r.Description  ?? '',
      applicability: r.Applicability ?? null,
    }));
  }

  /** @private */
  _extractFareBasis(fareBasis) {
    return {
      code:       fareBasis.Code      ?? '',
      fareType:   fareBasis.FareType  ?? null,
      publicFare: fareBasis.PublicFare ?? true,
      rules: (fareBasis.Rules?.Rule ?? []).map(r => ({
        type:        r.Type        ?? '',
        description: r.Description ?? '',
        details:     r.Details     ?? null,
      })),
    };
  }

  /** @private */
  _extractPenalties() {
    return (this.data?.Response?.ReshopResults?.Penalties ?? []).map(p => ({
      type:            p.Type            ?? '',
      applicationType: p.ApplicationType ?? '',
      amount: {
        value:    p.Amount?.value ?? 0.0,
        currency: p.Amount?.Code  ?? '',
      },
      description:  p.Description ?? null,
      restrictions: this._extractRestrictions(p.Restrictions ?? []),
    }));
  }

  /** @private */
  _extractAirports() {
    return (this.data?.Response?.DataLists?.AirportList ?? []).map(a => ({
      code:        a.AirportCode?.value ?? '',
      name:        a.Name              ?? '',
      cityCode:    a.CityCode          ?? null,
      countryCode: a.CountryCode       ?? null,
      terminal:    a.Terminal          ?? null,
    }));
  }

  /** @private */
  _extractAirlines() {
    return (this.data?.Response?.DataLists?.CarrierList ?? []).map(c => ({
      code:     c.AirlineID?.value ?? '',
      name:     c.Name             ?? '',
      alliance: c.Alliance         ?? null,
    }));
  }

  /** @private */
  _extractEquipment() {
    return (this.data?.Response?.DataLists?.EquipmentList ?? []).map(e => ({
      code: e.AircraftCode  ?? '',
      name: e.Name          ?? '',
      type: e.AircraftType  ?? null,
    }));
  }
}

export default ItinReshopResponse;
