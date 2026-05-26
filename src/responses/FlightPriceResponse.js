/**
 * @fileoverview Response class for the Verteil FlightPrice endpoint.
 *
 * Parses priced flight offers, data lists (segments, baggage, fares, penalties,
 * price classes, services), metadata, and payment surcharge information from the
 * raw NDC FlightPrice response body.
 *
 * Currency rounding is driven by decimals declared in the NDC Metadata block.
 * Media references are pre-indexed from DataLists.MediaList for O(1) lookup.
 */



import BaseResponse from './BaseResponse.js';

/** @type {Object<string,number>} Default decimal places per ISO currency code. */
const DEFAULT_CURRENCY_DECIMALS = {
  USD: 2, EUR: 2, GBP: 2, CHF: 2,
  INR: 0, JPY: 0, AED: 0,
};

/**
 * @class FlightPriceResponse
 * @extends BaseResponse
 */
class FlightPriceResponse extends BaseResponse {
  /**
   * @param {Object} data Raw NDC FlightPrice response body.
   */
  constructor(data) {
    super(data);
    /** @private @type {Object<string,number>} */
    this._currencyDecimals = { ...DEFAULT_CURRENCY_DECIMALS };
    /** @private @type {Object<string,{links:Object, descriptions:Array}>} */
    this._mediaReferences = {};
    this._initializeCurrencyDecimals();
    this._buildMediaReferences();
  }

  /**
   * Returns a normalised summary of the FlightPrice response.
   * @returns {Object}
   */
  toArray() {
    if (!this.data) return {};
    return {
      success:        this.isSuccessful(),
      response_id:    this.getResponseId(),
      correlation_id: this.getCorrelationId(),
      timestamp:      this._getTimestamp(),
      response:       this.data,
      warnings:       this.getWarnings(),
      errors:         this.getErrors(),
      statistics:     this._getStatistics(),
    };
  }

  // ── Public accessors ──────────────────────────────────────────────────────

  /**
   * Returns `true` when no errors are present and at least one priced offer exists.
   * @returns {boolean}
   */
  isSuccessful() {
    return this.getErrors().length === 0 && this.getPricedOffers().length > 0;
  }

  /**
   * Returns the ShoppingResponseID from the response.
   * @returns {string|null}
   */
  getResponseId() {
    return this.data?.ShoppingResponseID?.ResponseID?.value ?? null;
  }

  /**
   * Returns the NDC correlation ID.
   * @returns {string|null}
   */
  getCorrelationId() {
    return this.data?.CorrelationID ?? null;
  }

  /**
   * Returns priced flight offers with offer IDs, items, and time limits.
   * @returns {Array}
   */
  getPricedOffers() {
    return (this.data?.PricedFlightOffers?.PricedFlightOffer ?? []).map(offer => ({
      offer_id: {
        value:      offer.OfferID?.value      ?? null,
        owner:      offer.OfferID?.Owner      ?? null,
        object_key: offer.OfferID?.ObjectKey  ?? null,
        channel:    offer.OfferID?.Channel    ?? 'NDC',
      },
      offer_items: this._formatOfferItems(offer.OfferPrice ?? []),
      time_limits: this._formatTimeLimits(offer.TimeLimits ?? {}),
    }));
  }

  /**
   * Returns flight segments from FlightSegmentList.
   * @returns {Array}
   */
  getFlightSegments() {
    return (this.data?.DataLists?.FlightSegmentList?.FlightSegment ?? []).map(seg => ({
      segment_key:       seg.SegmentKey ?? null,
      departure:         this._formatDepartureArrival(seg.Departure   ?? {}),
      arrival:           this._formatDepartureArrival(seg.Arrival     ?? {}),
      marketing_carrier: this._formatCarrier(seg.MarketingCarrier ?? {}),
      operating_carrier: this._formatCarrier(seg.OperatingCarrier ?? {}),
      equipment: {
        code: seg.Equipment?.AircraftCode?.value ?? null,
        name: seg.Equipment?.Name               ?? null,
      },
      duration: this._parseDuration(seg.FlightDetail?.FlightDuration?.Value ?? null),
      stops:    this._formatStops(seg.FlightDetail?.Stops ?? {}),
    }));
  }

  /**
   * Returns the flight list with journey times and segment references.
   * @returns {Array}
   */
  getFlightList() {
    return (this.data?.DataLists?.FlightList?.Flight ?? []).map(flight => ({
      flight_key:   flight.FlightKey ?? null,
      segment_refs: flight.SegmentReferences?.value ?? [],
      journey: {
        time: this._parseDuration(flight.Journey?.Time ?? null),
        distance: {
          value: flight.Journey?.Distance?.Value ?? null,
          unit:  flight.Journey?.Distance?.UOM   ?? null,
        },
      },
    }));
  }

  /**
   * Returns origin-destination entries.
   * @returns {Array}
   */
  getOriginDestinations() {
    return (this.data?.DataLists?.OriginDestinationList?.OriginDestination ?? []).map(od => ({
      key:           od.OriginDestinationKey    ?? null,
      departure_code: od.DepartureCode?.value   ?? null,
      arrival_code:   od.ArrivalCode?.value      ?? null,
      flight_refs:    od.FlightReferences?.value ?? [],
    }));
  }

  /**
   * Returns traveler definitions (anonymous and recognized).
   * @returns {Array}
   */
  getTravelers() {
    const travelers = [];
    for (const t of this.data?.DataLists?.AnonymousTravelerList?.AnonymousTraveler ?? []) {
      travelers.push({
        type:       'anonymous',
        object_key: t.ObjectKey    ?? null,
        ptc:        t.PTC?.value   ?? null,
        age: t.Age ? {
          value:      t.Age.Value?.value   ?? null,
          birth_date: this._formatDateTime(t.Age.BirthDate?.value ?? null),
        } : null,
      });
    }
    for (const t of this.data?.DataLists?.RecognizedTravelerList?.RecognizedTraveler ?? []) {
      travelers.push({
        type:       'recognized',
        object_key: t.ObjectKey  ?? null,
        ptc:        t.PTC?.value ?? null,
        name: t.Name ? {
          given:   (Array.isArray(t.Name.Given) ? t.Name.Given : [t.Name.Given])
                     .map(g => g?.value ?? null),
          surname: t.Name.Surname?.value ?? null,
          title:   t.Name.Title         ?? null,
        } : null,
        frequent_flyer: (t.FQTVs ?? []).map(fqtv => ({
          airline_id:     fqtv.AirlineID?.value        ?? null,
          account_number: fqtv.Account?.Number?.[0]?.value ?? null,
          program_id:     fqtv.ProgramID               ?? null,
        })),
      });
    }
    return travelers;
  }

  /**
   * Returns checked and carry-on baggage allowances along with disclosures.
   * @returns {{checked:Array, carry_on:Array, disclosures:Array}}
   */
  getBaggageAllowance() {
    return {
      checked:     this._getCheckedBaggageAllowance(),
      carry_on:    this._getCarryOnBaggageAllowance(),
      disclosures: this._getBaggageDisclosures(),
    };
  }

  /**
   * Returns price class definitions.
   * @returns {Array}
   */
  getPriceClasses() {
    return (this.data?.DataLists?.PriceClassList?.PriceClass ?? []).map(pc => ({
      object_key:    pc.ObjectKey    ?? null,
      name:          pc.Name         ?? null,
      code:          pc.Code         ?? null,
      display_order: pc.DisplayOrder ?? null,
      descriptions: (pc.Descriptions?.Description ?? []).map(d => ({
        text:     d.Text?.value ?? null,
        category: d.Category   ?? null,
        media:    d.Media ? this._formatMedia(d.Media) : null,
      })),
    }));
  }

  /**
   * Returns ancillary service definitions.
   * @returns {Array}
   */
  getServices() {
    return (this.data?.DataLists?.ServiceList?.Service ?? []).map(svc => ({
      object_key: svc.ObjectKey ?? null,
      service_id: {
        value: svc.ServiceID?.value ?? null,
        owner: svc.ServiceID?.Owner ?? null,
      },
      name:         svc.Name?.value ?? null,
      descriptions: (svc.Descriptions?.Description ?? []).map(d => d.Text?.value ?? null),
      price: (svc.Price ?? []).map(p => ({
        total: this._formatAmount(p.Total ?? {}),
      })),
    }));
  }

  /**
   * Returns fare group entries from FareList.
   * @returns {Array}
   */
  getFares() {
    return (this.data?.DataLists?.FareList?.FareGroup ?? []).map(fare => ({
      list_key:       fare.ListKey            ?? null,
      fare_basis_code: fare.FareBasisCode?.Code ?? null,
      fare: {
        code: fare.Fare?.FareCode?.Code ?? null,
        type: this._extractFareType(fare.Fare?.FareDetail?.Remarks ?? {}),
      },
      refs: fare.refs ?? [],
    }));
  }

  /**
   * Returns penalty list entries.
   * @returns {Array}
   */
  getPenalties() {
    return (this.data?.DataLists?.PenaltyList?.Penalty ?? []).map(p => ({
      object_key: p.ObjectKey ?? null,
      details: (p.Details?.Detail ?? []).map(d => ({
        type:        d.Type               ?? null,
        application: { code: d.Application?.Code ?? null },
        amounts:     this._formatPenaltyAmounts(d.Amounts ?? {}),
      })),
      indicators: {
        cancel_fee:     p.CancelFeeInd     ?? false,
        change_allowed: p.ChangeAllowedInd ?? false,
        refundable:     p.RefundableInd    ?? false,
        upgrade_fee:    p.UpgradeFeeInd    ?? false,
        change_fee:     p.ChangeFeeInd     ?? false,
      },
    }));
  }

  /**
   * Returns warnings from the response.
   * @returns {Array<{text:string|null, owner:string|null}>}
   */
  getWarnings() {
    return (this.data?.Warnings?.Warning ?? []).map(w => ({
      text:  w.value ?? null,
      owner: w.Owner ?? null,
    }));
  }

  /**
   * Returns error objects from the response.
   * @returns {Array}
   */
  getErrors() {
    return (this.data?.Errors?.Error ?? []).map(e => ({
      code:       e.Code      ?? null,
      short_text: e.ShortText ?? null,
      message:    e.value     ?? null,
      owner:      e.Owner     ?? null,
      reason:     e.Reason    ?? null,
    }));
  }

  /**
   * Returns payment surcharge information from the Payments block.
   * @returns {Array}
   */
  getPayments() {
    return (this.data?.Payments?.Payment ?? []).map(payment => ({
      payment_surcharge: {
        precise_amount: payment.PaymentSurcharge?.preciseAmount
          ? this._formatAmount(payment.PaymentSurcharge.preciseAmount)
          : null,
        percentage_range: {
          min: payment.PaymentSurcharge?.percentageRangeMin?.value ?? null,
          max: payment.PaymentSurcharge?.percentageRangeMax?.value ?? null,
        },
      },
    }));
  }

  // ── Private formatters ────────────────────────────────────────────────────

  /** @private */
  _formatOfferItems(offerPrices) {
    return offerPrices.map(price => ({
      offer_item_id: price.OfferItemID ?? null,
      associations:  this._formatAssociations(price.RequestedDate?.Associations ?? []),
      price_detail:  this._formatPriceDetail(price.RequestedDate?.PriceDetail   ?? {}),
      fare_detail:   this._formatFareDetail(price.FareDetail  ?? {}),
      commission:    this._formatCommission(price.Commission   ?? []),
    }));
  }

  /** @private */
  _formatAssociations(associations) {
    return associations.map(assoc => ({
      travelers: assoc.AssociatedTraveler?.TravelerReferences ?? [],
      flights: {
        segments:             this._formatFlightSegmentReferences(assoc.ApplicableFlight?.FlightSegmentReference ?? []),
        references:           assoc.ApplicableFlight?.FlightReferences?.value          ?? [],
        origin_destination_refs: assoc.ApplicableFlight?.OriginDestinationReferences   ?? [],
      },
      price_class: assoc.PriceClass?.PriceClassReference ?? null,
      services:    this._formatAssociatedServices(assoc.AssociatedService ?? {}),
    }));
  }

  /** @private */
  _formatFlightSegmentReferences(references) {
    return references.map(ref => ({
      reference: ref.ref ?? null,
      class_of_service: {
        code: ref.ClassOfService?.Code?.value ?? null,
        marketing_name: {
          value:            ref.ClassOfService?.MarketingName?.value           ?? null,
          cabin_designator: ref.ClassOfService?.MarketingName?.CabinDesignator ?? null,
        },
        class_of_service_refs: ref.ClassOfService?.refs ?? null,
      },
      baggage: {
        carry_on_refs:    ref.BagDetailAssociation?.CarryOnReferences      ?? [],
        checked_refs:     ref.BagDetailAssociation?.CheckedBagReferences   ?? [],
        disclosure_refs:  ref.BagDetailAssociation?.BagDisclosureReferences ?? null,
      },
    }));
  }

  /** @private */
  _formatAssociatedServices(services) {
    if (!services || !Object.keys(services).length) return [];
    return {
      references: services.ServiceReferences ?? [],
      seat_assignments: (services.SeatAssignment ?? []).map(sa => ({
        location: {
          column:          sa.Seat?.Location?.Column                         ?? null,
          row:             sa.Seat?.Location?.Row?.Number?.value             ?? null,
          characteristics: this._formatSeatCharacteristics(sa.Seat?.Location?.Characteristics ?? {}),
        },
      })),
    };
  }

  /** @private */
  _formatSeatCharacteristics(characteristics) {
    if (!characteristics || !Object.keys(characteristics).length) return [];
    return (characteristics.Characteristic ?? []).map(c => ({
      code:    c.Code ?? null,
      remarks: (c.Remarks?.Remark ?? []).map(r => r.value ?? null),
    }));
  }

  /** @private */
  _formatPriceDetail(detail) {
    return {
      base_amount: this._formatAmount(detail.BaseAmount ?? {}),
      taxes:       this._formatTaxes(detail.Taxes       ?? {}),
      fees:        this._formatFees(detail.Fees          ?? {}),
      surcharges:  this._formatSurcharges(detail.Surcharges ?? {}),
      total_amount: {
        value:    parseFloat(detail.TotalAmount?.SimpleCurrencyPrice?.value ?? 0),
        currency: detail.TotalAmount?.SimpleCurrencyPrice?.Code ?? null,
      },
      discounts: this._formatDiscounts(detail.Discount ?? []),
    };
  }

  /** @private */
  _formatTaxes(taxes) {
    return {
      total:     this._formatAmount(taxes.Total ?? {}),
      breakdown: (taxes.Breakdown?.Tax ?? []).map(t => ({
        code:        t.TaxCode     ?? null,
        amount:      this._formatAmount(t.Amount ?? {}),
        description: t.Description ?? null,
      })),
    };
  }

  /** @private */
  _formatFees(fees) {
    if (!fees.Total && !fees.Breakdown) return [];
    return {
      total:     this._formatAmount(fees.Total ?? {}),
      breakdown: (fees.Breakdown?.Fee ?? []).map(fee => ({
        code:       fee.FeeCode   ?? null,
        amount:     this._formatAmount(fee.Amount ?? {}),
        name:       fee.FeeName   ?? null,
        owner:      fee.FeeOwner  ?? null,
        percentage: fee.FeePercent ?? null,
        refundable: fee.RefundInd  ?? false,
      })),
    };
  }

  /** @private */
  _formatSurcharges(surcharges) {
    if (!surcharges || !Object.keys(surcharges).length) return [];
    return (surcharges.Surcharge ?? []).map(s => ({
      total:     this._formatAmount(s.Total ?? {}),
      breakdown: (s.Breakdown?.Fee ?? []).map(fee => ({
        amount:      this._formatAmount(fee.Amount ?? {}),
        designator:  fee.Designator  ?? null,
        description: fee.Description ?? null,
        owner:       fee.FeeOwner    ?? null,
        percentage:  fee.FeePercent  ?? null,
      })),
    }));
  }

  /** @private */
  _formatDiscounts(discounts) {
    return discounts.map(d => ({
      amount:               this._formatAmount(d.DiscountAmount ?? {}),
      percentage:           d.DiscountPercent      ?? null,
      owner:                d.discountOwner        ?? null,
      code:                 d.discountCode         ?? null,
      name:                 d.discountName         ?? null,
      pre_discounted_amount: this._formatAmount(d.preDiscountedAmount ?? {}),
    }));
  }

  /** @private */
  _formatFareDetail(fareDetail) {
    if (!fareDetail || !Object.keys(fareDetail).length) return {};
    return {
      components: (fareDetail.FareComponent ?? []).map(comp => ({
        fare_basis: {
          code: comp.FareBasis?.FareBasisCode?.Code ?? null,
          rbd:  comp.FareBasis?.RBD                ?? null,
        },
        rules:        this._formatFareRules(comp.FareRules ?? {}),
        segment_refs: comp.refs ?? [],
      })),
    };
  }

  /** @private */
  _formatFareRules(rules) {
    if (!rules || !Object.keys(rules).length) return {};
    return {
      penalty_refs:      rules.Penalty?.refs        ?? [],
      change_fees:       rules.ChangeFees            ?? [],
      cancellation_fees: rules.CancellationFees      ?? [],
      corporate_fare:    this._formatCorporateFare(rules.CorporateFare ?? {}),
    };
  }

  /** @private */
  _formatCorporateFare(cf) {
    if (!cf || !Object.keys(cf).length) return null;
    return {
      account: { code: cf.Account?.Code ?? null, value: cf.Account?.value ?? null },
      name:    cf.Name ?? null,
      type:    cf.Type ?? null,
    };
  }

  /** @private */
  _formatCommission(commission) {
    return (Array.isArray(commission) ? commission : []).map(comm => ({
      amount:     this._formatAmount(comm.Amount ?? {}),
      percentage: comm.Percentage ? this._formatAmount(comm.Percentage) : null,
      code:       comm.Code  ?? null,
      owner:      comm.Owner ?? null,
      type:       comm.Type  ?? null,
    }));
  }

  /** @private */
  _formatDepartureArrival(point) {
    return {
      airport: {
        code: point.AirportCode?.value ?? null,
        name: point.AirportName        ?? null,
      },
      terminal: point.Terminal ? { name: point.Terminal.Name ?? null } : null,
      time:         point.Time        ?? null,
      date:         this._formatDateTime(point.Date ?? null),
      change_of_day: point.ChangeOfDay ?? 0,
    };
  }

  /** @private */
  _formatCarrier(carrier) {
    if (!carrier || !Object.keys(carrier).length) return {};
    return {
      airline_id:    carrier.AirlineID?.value    ?? null,
      name:          carrier.Name                ?? null,
      flight_number: carrier.FlightNumber?.value ?? null,
    };
  }

  /** @private */
  _formatStops(stops) {
    if (!stops || !Object.keys(stops).length) return { count: 0, locations: [] };
    return {
      count:     stops.StopQuantity ?? 0,
      locations: (stops.StopLocations?.StopLocation ?? []).map(loc => ({
        airport:        loc.AirportCode?.value ?? null,
        arrival_time:   loc.ArrivalTime        ?? null,
        departure_time: loc.DepartureTime      ?? null,
        duration:       loc.Duration           ?? null,
        arrival_date:   this._formatDateTime(loc.ArrivalDate   ?? null),
        departure_date: this._formatDateTime(loc.DepartureDate ?? null),
      })),
    };
  }

  /** @private */
  _formatTimeLimits(limits) {
    if (!limits || !Object.keys(limits).length) return {};
    return {
      payment: { datetime: this._formatDateTime(limits.Payment?.DateTime ?? null) },
      offer_expiration: {
        datetime:  this._formatDateTime(limits.OfferExpiration?.DateTime  ?? null),
        guaranteed: limits.OfferExpiration?.Guaranteed ?? false,
        price: limits.OfferExpiration?.Price
          ? this._formatPrice(limits.OfferExpiration.Price)
          : null,
      },
    };
  }

  /** @private */
  _formatPrice(price) {
    if (!price || !Object.keys(price).length) return null;
    return {
      total_amount: price.TotalAmount ? {
        value:    parseFloat(price.TotalAmount.value ?? 0),
        currency: price.TotalAmount.Code ?? null,
      } : null,
      base_amount: price.BaseAmount ? {
        value:    parseFloat(price.BaseAmount.value ?? 0),
        currency: price.BaseAmount.Code ?? null,
      } : null,
      taxes: price.Taxes ? {
        total: {
          value:    parseFloat(price.Taxes.Total?.value ?? 0),
          currency: price.Taxes.Total?.Code ?? null,
        },
        breakdown: (price.Taxes.Breakdown?.Tax ?? []).map(t => ({
          tax_code: t.TaxCode ?? null,
          amount: {
            value:    parseFloat(t.Amount?.value ?? 0),
            currency: t.Amount?.Code ?? null,
          },
          description: t.Description ?? null,
        })),
      } : null,
    };
  }

  /** @private */
  _formatAmount(amount) {
    if (!amount || !Object.keys(amount).length) return null;
    return {
      value:    parseFloat(amount.value ?? 0),
      currency: amount.Code ?? null,
    };
  }

  /** @private */
  _formatPenaltyAmounts(amounts) {
    return (amounts.Amount ?? []).map(amount => ({
      value:       this._formatAmount(amount.CurrencyAmountValue ?? {}),
      application: amount.AmountApplication ?? null,
      remarks:     (amount.ApplicableFeeRemarks?.Remark ?? []).map(r => r.value ?? null),
    }));
  }

  /** @private */
  _formatMedia(media) {
    return (Array.isArray(media) ? media : []).map(item => {
      if (item.MediaRef?.ref) {
        const ref = this._mediaReferences[item.MediaRef.ref] ?? null;
        if (ref) return { reference: item.MediaRef.ref, links: ref.links, descriptions: ref.descriptions };
      }
      return {
        links: item.MediaLinks ? this._formatMediaLinks(item.MediaLinks) : [],
        descriptions: (item.Descriptions?.Description ?? []).map(d => d.Text?.value ?? null),
      };
    });
  }

  /** @private */
  _formatMediaLinks(links) {
    const out = {};
    for (const link of (links ?? [])) {
      out[link.Size ?? 'default'] = { url: link.Url ?? null, type: link.Type ?? null, size: link.Size ?? null };
    }
    return out;
  }

  /** @private */
  _formatAugmentationPoints(points) {
    const out = [];
    for (const point of points) {
      for (const vdcPoint of point.any?.VdcAugPoint ?? []) {
        out.push({ key: vdcPoint.Key ?? null, value: vdcPoint.Value ?? null });
      }
    }
    return out;
  }

  /** @private */
  _formatCardFields(fields) {
    if (!fields.FieldName) return [];
    return { name: fields.FieldName.value ?? null, mandatory: fields.FieldName.Mandatory ?? false };
  }

  /** @private */
  _extractFareType(remarks) {
    if (!remarks || !Object.keys(remarks).length) return null;
    for (const remark of remarks.Remark ?? []) {
      if (remark.value) return remark.value;
    }
    return null;
  }

  /** @private */
  _determineBaggageType(listKey) {
    if (listKey.includes('CKBAG'))   return 'checked';
    if (listKey.includes('HANDBAG')) return 'carry_on';
    return 'unknown';
  }

  /** @private */
  _extractCurrencyMetadata() {
    const metadata = {};
    for (const meta of this.data?.Metadata?.Other?.OtherMetadata ?? []) {
      for (const currency of meta.CurrencyMetadatas?.CurrencyMetadata ?? []) {
        metadata[currency.MetadataKey] = { decimals: currency.Decimals ?? 2 };
      }
    }
    return metadata;
  }

  /** @private */
  _extractPriceMetadata() {
    const metadata = {};
    for (const meta of this.data?.Metadata?.Other?.OtherMetadata ?? []) {
      for (const price of meta.PriceMetadatas?.PriceMetadata ?? []) {
        metadata[price.MetadataKey] = {
          augmentation_points: this._formatAugmentationPoints(price.AugmentationPoint?.AugPoint ?? []),
        };
      }
    }
    return metadata;
  }

  /** @private */
  _extractPaymentCardMetadata() {
    const metadata = [];
    for (const meta of this.data?.Metadata?.Other?.OtherMetadata ?? []) {
      for (const card of meta.PaymentCardMetadatas?.PaymentCardMetadata ?? []) {
        metadata.push({
          name:   card.CardName     ?? null,
          type:   card.CardType     ?? null,
          code:   card.CardCode     ?? null,
          key:    card.MetadataKey  ?? null,
          fields: this._formatCardFields(card.CardFields ?? {}),
        });
      }
    }
    return metadata;
  }

  /** @private */
  _initializeCurrencyDecimals() {
    for (const [key, val] of Object.entries(this._extractCurrencyMetadata())) {
      this._currencyDecimals[key] = val.decimals;
    }
  }

  /** @private */
  _buildMediaReferences() {
    for (const media of this.data?.DataLists?.MediaList?.Media ?? []) {
      if (media.ListKey) {
        this._mediaReferences[media.ListKey] = {
          links:        this._formatMediaLinks(media.MediaLinks ?? []),
          descriptions: (media.Descriptions?.Description ?? []).map(d => d.Text?.value ?? null),
        };
      }
    }
  }

  /** @private */
  _getCheckedBaggageAllowance() {
    return (this.data?.DataLists?.CheckedBagAllowanceList?.CheckedBagAllowance ?? []).map(a => ({
      list_key:         a.ListKey ?? null,
      piece_allowance:  this._formatPieceAllowance(a.PieceAllowance  ?? []),
      weight_allowance: this._formatWeightAllowance(a.WeightAllowance ?? {}),
      description:      this._formatAllowanceDescription(a.AllowanceDescription ?? {}),
    }));
  }

  /** @private */
  _getCarryOnBaggageAllowance() {
    return (this.data?.DataLists?.CarryOnAllowanceList?.CarryOnAllowance ?? []).map(a => ({
      list_key:         a.ListKey ?? null,
      piece_allowance:  this._formatPieceAllowance(a.PieceAllowance  ?? []),
      weight_allowance: this._formatWeightAllowance(a.WeightAllowance ?? {}),
      description:      this._formatAllowanceDescription(a.AllowanceDescription ?? {}),
    }));
  }

  /** @private */
  _getBaggageDisclosures() {
    return (this.data?.DataLists?.BagDisclosureList?.BagDisclosure ?? []).map(d => ({
      list_key:     d.ListKey ?? null,
      type:         this._determineBaggageType(d.ListKey ?? ''),
      descriptions: (d.Descriptions?.Description ?? []).map(desc => desc.Text?.value ?? null),
      rule:         d.BagRule ?? null,
    }));
  }

  /** @private */
  _formatPieceAllowance(pieceAllowance) {
    return pieceAllowance.map(p => ({
      applicable_party:  p.ApplicableParty           ?? null,
      total_quantity:    p.TotalQuantity              ?? 0,
      measurements: (p.PieceMeasurements ?? []).map(m => ({
        quantity:   m.Quantity   ?? 0,
        weight:     m.Weight     ?? null,
        dimensions: m.Dimensions ?? null,
      })),
      combination_type:  p.PieceAllowanceCombination ?? null,
      applicable_bag:    p.ApplicableBag             ?? null,
    }));
  }

  /** @private */
  _formatWeightAllowance(weightAllowance) {
    if (!weightAllowance || !Object.keys(weightAllowance).length) return [];
    return {
      applicable_party: weightAllowance.ApplicableParty ?? null,
      maximum_weights: (weightAllowance.MaximumWeight ?? []).map(w => ({
        value: parseFloat(w.Value ?? 0),
        unit:  w.UOM ?? null,
      })),
    };
  }

  /** @private */
  _formatAllowanceDescription(desc) {
    if (!desc || !Object.keys(desc).length) return [];
    return {
      applicable_party: desc.ApplicableParty ?? null,
      descriptions: (desc.Descriptions?.Description ?? []).map(d => d.Text?.value ?? null),
    };
  }

  /** @private */
  _parseDuration(duration) {
    if (!duration) return null;
    try {
      const m = duration.match(/PT(\d+H)?(\d+M)?/);
      const hours   = m?.[1] ? parseInt(m[1], 10) : 0;
      const minutes = m?.[2] ? parseInt(m[2], 10) : 0;
      return { hours, minutes, total_minutes: hours * 60 + minutes };
    } catch {
      return null;
    }
  }

  /** @private */
  _formatDateTime(datetime) {
    if (!datetime) return null;
    try {
      return new Date(datetime).toISOString().replace(/\.\d{3}Z$/, 'Z');
    } catch {
      return datetime;
    }
  }

  /** @private */
  _getTimestamp() {
    return this.data?.Metadata?.Timestamp
      ? this._formatDateTime(this.data.Metadata.Timestamp)
      : null;
  }

  /** @private */
  _calculateResponseTime() {
    return this.data?.Metadata?.ProcessingTime
      ? parseFloat(this.data.Metadata.ProcessingTime)
      : null;
  }

  /** @private */
  _getStatistics() {
    const offers   = this.getPricedOffers();
    const segments = this.getFlightSegments();
    return {
      total_offers:   offers.length,
      total_segments: segments.length,
      response_time:  this._calculateResponseTime(),
      timestamp:      this._getTimestamp(),
    };
  }
}

export default FlightPriceResponse;
