/**
 * @fileoverview Response class for the Verteil ServiceList endpoint.
 *
 * Provides typed accessors for services, service groups, service bundles,
 * features, and validation messages from the raw NDC response.
 */



import BaseResponse from './BaseResponse.js';

/**
 * @class ServiceListResponse
 * @extends BaseResponse
 */
class ServiceListResponse extends BaseResponse {
  /**
   * @param {Object} data Raw NDC response body.
   */
  constructor(data) {
    super(data);
  }

  /**
   * Returns a flat list of available ancillary services with pricing and availability.
   * @returns {Array<{serviceId:string, type:string, name:string, description:string, price:Object, segmentRefs:Array, passengerRefs:Array, availability:Object, media:Array}>}
   */
  getServices() {
    return (this.data?.Response?.ServiceList ?? []).map(svc => ({
      serviceId:      svc.ServiceID?.value ?? '',
      type:           svc.ServiceType      ?? '',
      name:           svc.Name             ?? '',
      description:    this._extractDescription(svc.Descriptions ?? []),
      price:          this._extractPrice(svc.Price ?? {}),
      segmentRefs:    svc.SegmentRefs      ?? [],
      passengerRefs:  svc.PassengerRefs    ?? [],
      availability:   this._extractAvailability(svc.Availability ?? {}),
      media:          this._extractMedia(svc.MediaObjects ?? []),
    }));
  }

  /**
   * Returns service groups that bundle related ancillaries.
   * @returns {Array<{groupId:string, name:string, description:string, serviceRefs:Array, category:string|null}>}
   */
  getServiceGroups() {
    return (this.data?.Response?.ServiceGroups ?? []).map(g => ({
      groupId:     g.GroupID ?? '',
      name:        g.Name    ?? '',
      description: this._extractDescription(g.Descriptions ?? []),
      serviceRefs: g.ServiceRefs      ?? [],
      category:    g.ServiceCategory  ?? null,
    }));
  }

  /**
   * Returns service bundles (pre-defined ancillary packages).
   * @returns {Array<{bundleId:string, name:string, description:string, services:Array, price:Object}>}
   */
  getServiceBundles() {
    return (this.data?.Response?.ServiceBundles ?? []).map(b => ({
      bundleId:    b.BundleID?.value ?? '',
      name:        b.Name            ?? '',
      description: this._extractDescription(b.Descriptions ?? []),
      services: (b.Services ?? []).map(s => ({
        serviceRef:        s.ServiceRef        ?? '',
        includedQuantity:  s.IncludedQuantity  ?? 1,
        mandatory:         s.Mandatory         ?? false,
      })),
      price: this._extractPrice(b.Price ?? {}),
    }));
  }

  /**
   * Returns feature definitions associated with services.
   * @returns {Array<{featureId:string, name:string, description:string, serviceRefs:Array, value:*|null, unit:string|null}>}
   */
  getServiceFeatures() {
    return (this.data?.Response?.ServiceFeatures ?? []).map(f => ({
      featureId:   f.FeatureID   ?? '',
      name:        f.Name        ?? '',
      description: this._extractDescription(f.Descriptions ?? []),
      serviceRefs: f.ServiceRefs ?? [],
      value:       f.Value       ?? null,
      unit:        f.Unit        ?? null,
    }));
  }

  /**
   * Returns validation messages produced during service list processing.
   * @returns {Array<{type:string, status:string, message:string, serviceRefs:Array}>}
   */
  getValidationMessages() {
    return (this.data?.Response?.Validations ?? []).map(v => ({
      type:        v.Type        ?? '',
      status:      v.Status      ?? '',
      message:     v.Message     ?? '',
      serviceRefs: v.ServiceRefs ?? [],
    }));
  }

  /**
   * Returns the NDC correlation ID if present.
   * @returns {string|null}
   */
  getCorrelationId() {
    return this.data?.Response?.CorrelationID ?? null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  _extractDescription(descriptions) {
    return descriptions[0]?.Text ?? '';
  }

  /** @private */
  _extractPrice(price) {
    return {
      amount:     price.TotalAmount?.value  ?? 0.0,
      currency:   price.TotalAmount?.Code   ?? '',
      baseAmount: price.BaseAmount?.value   ?? 0.0,
      taxes: (price.Taxes?.Tax ?? []).map(t => ({
        code:     t.TaxCode        ?? '',
        amount:   t.Amount?.value  ?? 0.0,
        currency: t.Amount?.Code   ?? '',
      })),
    };
  }

  /** @private */
  _extractAvailability(availability) {
    return {
      status:   availability.AvailabilityStatus  ?? '',
      quantity: availability.AvailableQuantity   ?? null,
      limitations: (availability.Limitations?.Limitation ?? []).map(l => ({
        type:        l.LimitationType ?? '',
        value:       l.Value          ?? '',
        description: l.Description    ?? null,
      })),
    };
  }

  /** @private */
  _extractMedia(mediaObjects) {
    return mediaObjects.map(m => ({
      id:          m.ID          ?? '',
      url:         m.URI         ?? '',
      type:        m.MediaType   ?? '',
      format:      m.Format      ?? null,
      width:       m.Width       ?? null,
      height:      m.Height      ?? null,
      title:       m.Title       ?? null,
      description: m.Description ?? null,
    }));
  }
}

export default ServiceListResponse;
