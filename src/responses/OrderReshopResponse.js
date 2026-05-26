/**
 * @fileoverview Response class for the Verteil OrderReshop endpoint.
 *
 * Parses re-priced offers, data lists, alternate date options, and metadata
 * from the raw NDC response returned by the OrderReshop flow.
 */



import BaseResponse from './BaseResponse.js';

/**
 * @class OrderReshopResponse
 * @extends BaseResponse
 */
class OrderReshopResponse extends BaseResponse {
  /**
   * @param {Object} data Raw NDC response body.
   */
  constructor(data) {
    super(data);
  }

  /**
   * Returns the ResponseID of the reshop results block.
   * @returns {string}
   */
  getResponseId() {
    return this.data?.Response?.ReshopResults?.ResponseID?.value ?? '';
  }

  /**
   * Returns the expiration date-time of the reshop result set.
   * @returns {string|null}
   */
  getExpirationDateTime() {
    return this.data?.Response?.ReshopResults?.ExpirationDateTime ?? null;
  }

  /**
   * Returns normalised reshop offer objects with pricing and penalties.
   * @returns {Array<{offerId:string, owner:string, items:Array, price:Object|null, priceDifference:Object|null, penalties:Array}>}
   */
  getReshopOffers() {
    return (this.data?.Response?.ReshopResults?.Offers ?? []).map(offer => ({
      offerId:        offer.OfferID?.value ?? '',
      owner:          offer.OfferID?.Owner ?? '',
      items:          this._extractOfferItems(offer.OfferItems ?? []),
      price:          this._extractPrice(offer.TotalPrice ?? {}),
      priceDifference: this._extractPrice(offer.PriceDifference ?? {}),
      penalties:      this._extractPenalties(offer.Penalties ?? []),
    }));
  }

  /**
   * Returns data lists (segments, baggage allowances, service definitions).
   * @returns {{segments:Array, baggage:Array, services:Array}}
   */
  getDataLists() {
    if (!this.data?.Response?.DataLists) return { segments: [], baggage: [], services: [] };
    return {
      segments: this._extractSegmentList(this.data.Response.DataLists.FlightSegmentList ?? {}),
      baggage:  this._extractBaggageAllowances(this.data.Response.DataLists.BaggageAllowanceList ?? {}),
      services: this._extractServiceDefinitions(this.data.Response.DataLists.ServiceDefinitionList ?? {}),
    };
  }

  /**
   * Returns alternate departure date options with pricing.
   * @returns {Array<{date:string, price:Object|null, availability:string}>}
   */
  getAlternateDateOptions() {
    return (this.data?.Response?.AlternateDateOptions ?? []).map(opt => ({
      date:         opt.Date                 ?? '',
      price:        this._extractPrice(opt.Price ?? {}),
      availability: opt.AvailabilityStatus   ?? '',
    }));
  }

  /**
   * Returns non-critical warnings.
   * @returns {Array<{code:string, type:string, description:string}>}
   */
  getWarnings() {
    return (this.data?.Response?.Warnings ?? []).map(w => ({
      code:        w.Code        ?? '',
      type:        w.Type        ?? '',
      description: w.Description ?? '',
    }));
  }

  /**
   * Returns the NDC correlation ID.
   * @returns {string|null}
   */
  getCorrelationId() {
    return this.data?.Response?.CorrelationID ?? null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  _extractOfferItems(items) {
    return items.map(item => ({
      itemId:   item.OfferItemID?.value ?? '',
      type:     item.OfferItemType      ?? '',
      flights:  this._extractFlights(item.FlightItem ?? []),
      services: this._extractServices(item.ServiceItem ?? []),
    }));
  }

  /** @private */
  _extractFlights(flightItem) {
    return (Array.isArray(flightItem) ? flightItem : []).map(flight => ({
      segmentKey: flight.SegmentKey ?? '',
      departure: {
        airport:  flight.Departure?.AirportCode?.value     ?? '',
        date:     flight.Departure?.Date                   ?? '',
        time:     flight.Departure?.Time                   ?? '',
        terminal: flight.Departure?.Terminal?.Name         ?? null,
      },
      arrival: {
        airport:  flight.Arrival?.AirportCode?.value       ?? '',
        date:     flight.Arrival?.Date                     ?? '',
        time:     flight.Arrival?.Time                     ?? '',
        terminal: flight.Arrival?.Terminal?.Name           ?? null,
      },
      marketing: {
        airline:      flight.MarketingCarrier?.AirlineID?.value    ?? '',
        flightNumber: flight.MarketingCarrier?.FlightNumber?.value ?? '',
      },
      operating: flight.OperatingCarrier ? {
        airline:      flight.OperatingCarrier.AirlineID?.value    ?? '',
        flightNumber: flight.OperatingCarrier.FlightNumber?.value ?? '',
      } : null,
      equipment: flight.Equipment?.AircraftCode ?? null,
      duration:  flight.JourneyDuration         ?? null,
    }));
  }

  /** @private */
  _extractServices(serviceItem) {
    return (Array.isArray(serviceItem) ? serviceItem : []).map(svc => ({
      serviceId:   svc.ServiceID?.value         ?? '',
      code:        svc.ServiceCode?.Code        ?? '',
      name:        svc.Name                     ?? '',
      description: svc.Descriptions?.[0]?.Text ?? '',
      price:       this._extractPrice(svc.Price ?? {}),
    }));
  }

  /** @private */
  _extractPrice(price) {
    if (!price || !Object.keys(price).length) return null;
    return {
      amount:     price.TotalAmount?.value ?? 0.0,
      currency:   price.TotalAmount?.Code  ?? '',
      baseAmount: price.BaseAmount?.value  ?? 0.0,
      taxes: (price.Taxes?.Tax ?? []).map(t => ({
        code:     t.TaxCode       ?? '',
        amount:   t.Amount?.value ?? 0.0,
        currency: t.Amount?.Code  ?? '',
      })),
    };
  }

  /** @private */
  _extractPenalties(penalties) {
    return penalties.map(p => ({
      type:        p.PenaltyType    ?? '',
      amount:      p.Amount?.value  ?? 0.0,
      currency:    p.Amount?.Code   ?? '',
      description: p.Description   ?? '',
    }));
  }

  /** @private */
  _extractSegmentList(segmentList) {
    return (segmentList.FlightSegment ?? []).map(seg => ({
      segmentKey: seg.SegmentKey ?? '',
      departure: {
        airport:  seg.Departure?.AirportCode?.value   ?? '',
        terminal: seg.Departure?.Terminal?.Name        ?? null,
        date:     seg.Departure?.Date                  ?? '',
        time:     seg.Departure?.Time                  ?? '',
      },
      arrival: {
        airport:  seg.Arrival?.AirportCode?.value     ?? '',
        terminal: seg.Arrival?.Terminal?.Name          ?? null,
        date:     seg.Arrival?.Date                    ?? '',
        time:     seg.Arrival?.Time                    ?? '',
      },
      marketing: {
        airline:      seg.MarketingCarrier?.AirlineID?.value    ?? '',
        flightNumber: seg.MarketingCarrier?.FlightNumber?.value ?? '',
      },
      operating: seg.OperatingCarrier ? {
        airline:      seg.OperatingCarrier.AirlineID?.value    ?? '',
        flightNumber: seg.OperatingCarrier.FlightNumber?.value ?? '',
      } : null,
      equipment:  seg.Equipment?.AircraftCode ?? null,
      duration:   seg.JourneyDuration         ?? null,
      cabinType:  seg.CabinType?.Code         ?? null,
    }));
  }

  /** @private */
  _extractBaggageAllowances(baggageList) {
    return (baggageList.BaggageAllowance ?? []).map(bag => ({
      id:   bag.BaggageAllowanceID?.value ?? '',
      type: bag.TypeCode                  ?? '',
      weight: bag.WeightAllowance ? {
        value: bag.WeightAllowance.MaximumWeight?.Value ?? 0,
        unit:  bag.WeightAllowance.MaximumWeight?.UOM   ?? '',
      } : null,
      pieces: bag.PieceAllowance ? bag.PieceAllowance.TotalQuantity : null,
    }));
  }

  /** @private */
  _extractServiceDefinitions(serviceList) {
    return (serviceList.ServiceDefinition ?? []).map(svc => ({
      id:          svc.ServiceDefinitionID?.value ?? '',
      code:        svc.ServiceCode?.Code          ?? '',
      name:        svc.Name                       ?? '',
      description: svc.Descriptions?.[0]?.Text   ?? '',
      media: (svc.MediaObjects ?? []).map(m => ({
        id:   m.ID        ?? '',
        url:  m.URI       ?? '',
        type: m.MediaType ?? '',
      })),
    }));
  }
}

export default OrderReshopResponse;
