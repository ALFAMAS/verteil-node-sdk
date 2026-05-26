/**
 * @fileoverview Response class for the Verteil AirShopping endpoint.
 *
 * Parses the full NDC AirShopping response into a structured object with
 * typed accessors for offers, flight segments, baggage allowances, fares,
 * price classes, penalties, metadata, and statistics.
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

const CRITICAL_CODES = new Set(['710', 'INTERNAL_ERROR']);
const WARNING_CODES  = new Set(['325', 'VALIDATION_FAILURE']);

const ERROR_SUGGESTIONS = {
  '710':               'Check fare availability and search criteria',
  '325':               'Verify flight availability for the selected route',
  'VALIDATION_FAILURE': 'Review and correct input parameters',
  'INTERNAL_ERROR':    'Retry request or contact support',
};

/**
 * @class AirShoppingResponse
 * @extends BaseResponse
 */
class AirShoppingResponse extends BaseResponse {
  /**
   * @param {Object} data Raw NDC AirShopping response body.
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
   * Returns a fully normalised representation of the AirShopping response.
   * @returns {Object}
   */
  toArray() {
    if (!this.data) return {};
    return {
      document:           this.getDocumentInfo(),
      success:            this.isSuccessful(),
      offers:             this.getOffers(),
      data_lists: {
        flights:              this.getFlightList(),
        flight_segments:      this.getFlightSegments(),
        origin_destinations:  this.getOriginDestinations(),
        anonymous_travelers:  this.getAnonymousTravelers(),
        disclosures:          this.getDisclosures(),
        price_classes:        this.getPriceClasses(),
        fares:                this.getFares(),
        penalties:            this.getPenalties(),
        baggage_allowance:    this.getBaggageAllowance(),
      },
      metadata: {
        shopping: this.getShoppingMetadata(),
        currency: this._extractCurrencyMetadata(),
        other:    this.data.Metadata?.Other ?? [],
      },
      statistics:         this.getResponseStats(),
      warnings:           this.getWarnings(),
      errors:             this.getDetailedErrors(),
      response_id:        this.getResponseId(),
      response_timestamp: this._getResponseTimestamp(),
      trip_duration:      this.getTotalTripDuration(),
    };
  }

  // ── Public accessors ──────────────────────────────────────────────────────

  /**
   * Returns the document reference version and name.
   * @returns {{referenceVersion:string|null, name:string|null}}
   */
  getDocumentInfo() {
    return {
      referenceVersion: this.data.Document?.ReferenceVersion ?? null,
      name:             this.data.Document?.Name             ?? null,
    };
  }

  /**
   * Returns `true` when no errors are present and at least one offer exists.
   * @returns {boolean}
   */
  isSuccessful() {
    return 'Success' in (this.data ?? {}) ||
      (this.getOffers().length > 0 && this.getErrors().length === 0);
  }

  /**
   * Returns all airline offers, normalised from the OffersGroup block.
   * @returns {Array}
   */
  getOffers() {
    const offers = [];
    for (const airlineOffer of this.data?.OffersGroup?.AirlineOffers ?? []) {
      const owner = airlineOffer.Owner?.value ?? null;
      for (const offer of airlineOffer.AirlineOffer ?? []) {
        offers.push(this._formatOffer(offer, owner));
      }
    }
    return offers;
  }

  /**
   * Returns flight segments from FlightSegmentList.
   * @returns {Array}
   */
  getFlightSegments() {
    return (this.data?.DataLists?.FlightSegmentList?.FlightSegment ?? [])
      .map(seg => this._formatFlightSegment(seg));
  }

  /**
   * Returns checked and carry-on baggage allowances.
   * @returns {{checked:Array, carryOn:Array}}
   */
  getBaggageAllowance() {
    return {
      checked: this._getCheckedBaggageAllowance(),
      carryOn: this._getCarryOnBaggageAllowance(),
    };
  }

  /**
   * Returns price class definitions.
   * @returns {Array}
   */
  getPriceClasses() {
    return (this.data?.DataLists?.PriceClassList?.PriceClass ?? [])
      .map(pc => this._formatPriceClass(pc));
  }

  /**
   * Returns fare groups from FareList.
   * @returns {Array}
   */
  getFares() {
    return (this.data?.DataLists?.FareList?.FareGroup ?? [])
      .map(fare => this._formatFare(fare));
  }

  /**
   * Returns the shopping response metadata.
   * @returns {Object}
   */
  getMetadata() {
    return {
      shopping: this.data.Metadata?.Shopping ?? [],
      currency: this._extractCurrencyMetadata(),
      other:    this.data.Metadata?.Other    ?? [],
    };
  }

  /**
   * Returns parsed error objects.
   * @returns {Array<{code:string|null, type:string|null, message:string|null, shortText:string|null, owner:string|null, reason:string|null}>}
   */
  getErrors() {
    return (this.data?.Errors?.Error ?? []).map(e => ({
      code:      e.Code      ?? null,
      type:      e.Type      ?? null,
      message:   e.value     ?? null,
      shortText: e.ShortText ?? null,
      owner:     e.Owner     ?? null,
      reason:    e.Reason    ?? null,
    }));
  }

  /**
   * Returns errors enriched with severity classification and resolution suggestions.
   * @returns {Array}
   */
  getDetailedErrors() {
    return this.getErrors().map(err => ({
      ...err,
      severity:   this._determineErrorSeverity(err),
      suggestion: this._getErrorSuggestion(err),
      timestamp:  new Date().toISOString(),
    }));
  }

  /**
   * Returns warning objects.
   * @returns {Array<{message:string|null, owner:string|null}>}
   */
  getWarnings() {
    return (this.data?.Warnings?.Warning ?? []).map(w => ({
      message: w.value ?? null,
      owner:   w.Owner ?? null,
    }));
  }

  /**
   * Returns the ShoppingResponseID value.
   * @returns {string|null}
   */
  getResponseId() {
    return this.data?.ShoppingResponseID?.ResponseID?.value ?? null;
  }

  /**
   * Returns origin-destination list entries.
   * @returns {Array}
   */
  getOriginDestinations() {
    return (this.data?.DataLists?.OriginDestinationList?.OriginDestination ?? [])
      .map(od => this._formatOriginDestination(od));
  }

  /**
   * Returns anonymous traveler definitions.
   * @returns {Array}
   */
  getAnonymousTravelers() {
    return (this.data?.DataLists?.AnonymousTravelerList?.AnonymousTraveler ?? []).map(t => ({
      objectKey: t.ObjectKey       ?? null,
      ptc:       t.PTC?.value      ?? null,
      age: {
        value:     t.Age?.Value?.value    ?? null,
        birthDate: this._formatDateTime(t.Age?.BirthDate?.value ?? null),
      },
    }));
  }

  /**
   * Returns disclosure entries.
   * @returns {Array}
   */
  getDisclosures() {
    return (this.data?.DataLists?.DisclosureList?.Disclosures ?? []).map(d => ({
      listKey:      d.ListKey ?? null,
      descriptions: (d.Description ?? []).map(desc => desc.Text?.value ?? null),
    }));
  }

  /**
   * Returns penalty list entries.
   * @returns {Array}
   */
  getPenalties() {
    return (this.data?.DataLists?.PenaltyList?.Penalty ?? []).map(p => ({
      objectKey: p.ObjectKey ?? null,
      details: (p.Details?.Detail ?? []).map(d => ({
        type:        d.Type               ?? null,
        application: { code: d.Application?.Code ?? null },
        amounts:     this._formatPenaltyAmounts(d.Amounts ?? {}),
      })),
      changeFeeInd:    p.ChangeFeeInd    ?? false,
      changeAllowedInd: p.ChangeAllowedInd ?? false,
      refundableInd:   p.RefundableInd   ?? false,
    }));
  }

  /**
   * Returns the flight list with journey times and segment references.
   * @returns {Array}
   */
  getFlightList() {
    return (this.data?.DataLists?.FlightList?.Flight ?? []).map(flight => ({
      flightKey: flight.FlightKey ?? null,
      journey: {
        time: this._parseDuration(flight.Journey?.Time ?? null),
        distance: {
          value: flight.Journey?.Distance?.Value ?? null,
          unit:  flight.Journey?.Distance?.UOM   ?? null,
        },
      },
      segmentReferences: {
        values:   flight.SegmentReferences?.value    ?? [],
        onPoint:  flight.SegmentReferences?.OnPoint  ?? null,
        offPoint: flight.SegmentReferences?.OffPoint ?? null,
      },
    }));
  }

  /**
   * Returns offer metadata from the Shopping block.
   * @returns {Object}
   */
  getShoppingMetadata() {
    const meta = this.data?.Metadata?.Shopping?.ShopMetadataGroup?.Offer;
    if (!meta) return {};
    return {
      offerMetadata: (meta.disclosureMetadatasOrOfferMetadatasOrOfferInstructionMetadatas ?? []).map(m => ({
        metadataKey:       m.OfferMetadatas?.OfferMetadata?.[0]?.MetadataKey ?? null,
        augmentationPoints: this._formatAugmentationPoints(
          m.OfferMetadatas?.OfferMetadata?.[0]?.AugmentationPoint?.AugPoint ?? []
        ),
      })),
    };
  }

  /**
   * Returns overall response statistics (offer count, price range, airline count).
   * @returns {Object}
   */
  getResponseStats() {
    const offers   = this.getOffers();
    const segments = this.getFlightSegments();
    const prices   = offers.map(o => o.totalPrice?.amount ?? 0);
    return {
      total_offers:    offers.length,
      total_segments:  segments.length,
      unique_airlines: new Set(offers.map(o => o.owner)).size,
      price_range: {
        min: prices.length ? Math.min(...prices) : 0,
        max: prices.length ? Math.max(...prices) : 0,
        avg: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
      },
      response_timestamp: this._getResponseTimestamp(),
    };
  }

  /**
   * Returns the total trip duration summed across all flight segments.
   * @returns {{hours:number, minutes:number, total_minutes:number}|null}
   */
  getTotalTripDuration() {
    const segments = this.getFlightSegments();
    if (!segments.length) return null;
    const totalMinutes = segments.reduce((sum, seg) => {
      return sum + (seg.duration?.total_minutes ?? 0);
    }, 0);
    return {
      hours:         Math.floor(totalMinutes / 60),
      minutes:       totalMinutes % 60,
      total_minutes: totalMinutes,
    };
  }

  // ── Private formatters ────────────────────────────────────────────────────

  /** @private */
  _formatOffer(offer, owner) {
    return {
      offerId:     offer.OfferID?.value ?? null,
      owner:       owner ?? offer.OfferID?.Owner ?? null,
      channel:     offer.OfferID?.Channel ?? 'NDC',
      totalPrice:  this._formatPrice(offer.TotalPrice ?? {}),
      pricedOffer: this._formatPricedOffer(offer.PricedOffer ?? {}),
      timeLimit:   this._formatTimeLimit(offer.TimeLimits ?? {}),
      commission:  this._formatCommission(offer.Commission ?? []),
      references:  offer.refs ?? [],
    };
  }

  /** @private */
  _formatPricedOffer(pricedOffer) {
    return {
      associations: (pricedOffer.Associations ?? []).map(a => this._formatAssociations(a)),
      offerPrice: (pricedOffer.OfferPrice ?? []).map(price => ({
        requestedDate: {
          associations: this._formatRequestedDateAssociations(price.RequestedDate?.Associations ?? []),
          priceDetail:  this._formatPriceDetail(price.RequestedDate?.PriceDetail ?? {}),
        },
        fareDetail:  this._formatFareDetail(price.FareDetail ?? {}),
        offerItemId: price.OfferItemID ?? null,
      })),
    };
  }

  /** @private */
  _formatAssociations(assoc) {
    return {
      priceClass: { reference: assoc.PriceClass?.PriceClassReference ?? null },
      applicableFlight: {
        flightRefs:           assoc.ApplicableFlight?.FlightReferences?.value         ?? [],
        segmentRefs:          (assoc.ApplicableFlight?.FlightSegmentReference ?? []).map(r => this._formatFlightSegmentReference(r)),
        originDestinationRefs: assoc.ApplicableFlight?.OriginDestinationReferences ?? [],
      },
    };
  }

  /** @private */
  _formatFlightSegmentReference(segRef) {
    return {
      ref: segRef.ref ?? null,
      classOfService: {
        code: segRef.ClassOfService?.Code?.value ?? null,
        marketingName: {
          value:           segRef.ClassOfService?.MarketingName?.value           ?? null,
          cabinDesignator: segRef.ClassOfService?.MarketingName?.CabinDesignator ?? null,
        },
        seatsLeft: segRef.ClassOfService?.Code?.SeatsLeft ?? null,
      },
    };
  }

  /** @private */
  _formatRequestedDateAssociations(associations) {
    return associations.map(assoc => ({
      associatedTraveler: { references: assoc.AssociatedTraveler?.TravelerReferences ?? [] },
      applicableFlight: {
        flightReferences:         { value: assoc.ApplicableFlight?.FlightReferences?.value ?? [] },
        segmentReferences: (assoc.ApplicableFlight?.FlightSegmentReference ?? []).map(seg => ({
          ref:     seg.ref ?? null,
          baggage: {
            carryOn:  seg.BagDetailAssociation?.CarryOnReferences  ?? [],
            checked:  seg.BagDetailAssociation?.CheckedBagReferences ?? [],
          },
        })),
        originDestinationReferences: assoc.ApplicableFlight?.OriginDestinationReferences ?? [],
      },
    }));
  }

  /** @private */
  _formatPriceDetail(priceDetail) {
    return {
      baseAmount: {
        amount:   parseFloat(priceDetail.BaseAmount?.value ?? 0),
        currency: priceDetail.BaseAmount?.Code ?? null,
      },
      taxes: {
        total: {
          amount:   parseFloat(priceDetail.Taxes?.Total?.value ?? 0),
          currency: priceDetail.Taxes?.Total?.Code ?? null,
        },
        breakdown: (priceDetail.Taxes?.Breakdown?.Tax ?? []).map(t => ({
          taxCode:     t.TaxCode ?? null,
          amount: {
            value:    parseFloat(t.Amount?.value ?? 0),
            currency: t.Amount?.Code ?? null,
          },
          description: t.Description ?? null,
        })),
      },
      surcharges: this._formatSurcharges(priceDetail.Surcharges ?? {}),
      fees:       this._formatFees(priceDetail.Fees ?? {}),
      totalAmount: {
        amount:   parseFloat(priceDetail.TotalAmount?.SimpleCurrencyPrice?.value ?? 0),
        currency: priceDetail.TotalAmount?.SimpleCurrencyPrice?.Code ?? null,
      },
      discounts: (priceDetail.Discount ?? []).map(d => ({
        discountOwner:       d.discountOwner       ?? null,
        discountCode:        d.discountCode        ?? null,
        discountName:        d.discountName        ?? null,
        description:         d.Description         ?? null,
        application:         d.Application         ?? null,
        amount: {
          value:    parseFloat(d.DiscountAmount?.value ?? 0),
          currency: d.DiscountAmount?.Code ?? null,
        },
        percentage:          parseFloat(d.DiscountPercent ?? 0),
        preDiscountedAmount: {
          value:    parseFloat(d.preDiscountedAmount?.value ?? 0),
          currency: d.preDiscountedAmount?.Code ?? null,
        },
      })),
    };
  }

  /** @private */
  _formatFareDetail(fareDetail) {
    if (!fareDetail || !Object.keys(fareDetail).length) return {};
    return {
      fareComponents: (fareDetail.FareComponent ?? []).map(comp => ({
        refs:             comp.refs ?? [],
        segmentReference: { value: comp.SegmentReference?.value ?? null },
        fareRules: {
          corporate: this._formatCorporateFare(comp.FareRules?.CorporateFare ?? {}),
          penalties: comp.FareRules?.Penalty?.refs ?? [],
        },
      })),
      remarks: (fareDetail.Remarks?.Remark ?? []).map(r => ({
        code:  r.Code  ?? null,
        value: r.value ?? null,
        type:  r.Type  ?? null,
      })),
      fareIndicators: {
        refundable:  fareDetail.FareIndicators?.Refundable  ?? false,
        changeable:  fareDetail.FareIndicators?.Changeable  ?? false,
        upgradeable: fareDetail.FareIndicators?.Upgradeable ?? false,
      },
    };
  }

  /** @private */
  _formatCorporateFare(cf) {
    if (!cf || !Object.keys(cf).length) return null;
    return {
      account: { value: cf.Account?.value ?? null, code: cf.Account?.Code ?? null },
      name:    cf.Name ?? null,
      type:    cf.Type ?? null,
    };
  }

  /** @private */
  _formatPriceClass(priceClass) {
    return {
      objectKey:    priceClass.ObjectKey    ?? null,
      name:         priceClass.Name         ?? null,
      code:         priceClass.Code         ?? null,
      displayOrder: priceClass.DisplayOrder ?? null,
      descriptions: (priceClass.Descriptions?.Description ?? []).map(d => ({
        text:     d.Text?.value ?? null,
        category: d.Category    ?? null,
        media:    d.Media ? this._formatMedia(d.Media) : null,
      })),
    };
  }

  /** @private */
  _formatFare(fare) {
    return {
      listKey:       fare.ListKey                    ?? null,
      fareBasisCode: fare.FareBasisCode?.Code        ?? null,
      fareCode:      fare.Fare?.FareCode?.Code       ?? null,
      fareType:      this._extractFareType(fare),
      fareDetail:    this._formatFareDetail(fare.Fare?.FareDetail ?? {}),
      references:    fare.refs                       ?? [],
    };
  }

  /** @private */
  _formatFlightSegment(seg) {
    return {
      segmentKey: seg.SegmentKey ?? null,
      departure: {
        airport:     seg.Departure?.AirportCode?.value ?? null,
        terminal:    seg.Departure?.Terminal?.Name     ?? null,
        date:        this._formatDateTime(seg.Departure?.Date ?? null),
        time:        seg.Departure?.Time               ?? null,
        airportName: seg.Departure?.AirportName        ?? null,
      },
      arrival: {
        airport:     seg.Arrival?.AirportCode?.value   ?? null,
        terminal:    seg.Arrival?.Terminal?.Name       ?? null,
        date:        this._formatDateTime(seg.Arrival?.Date ?? null),
        time:        seg.Arrival?.Time                 ?? null,
        airportName: seg.Arrival?.AirportName          ?? null,
        changeOfDay: seg.Arrival?.ChangeOfDay          ?? 0,
      },
      marketing: {
        carrier:      seg.MarketingCarrier?.AirlineID?.value    ?? null,
        flightNumber: seg.MarketingCarrier?.FlightNumber?.value ?? null,
        name:         seg.MarketingCarrier?.Name                ?? null,
      },
      operating: this._formatOperatingCarrier(seg.OperatingCarrier ?? {}),
      equipment: {
        code: seg.Equipment?.AircraftCode?.value ?? null,
        name: seg.Equipment?.Name               ?? null,
      },
      duration: this._parseDuration(seg.FlightDetail?.FlightDuration?.Value ?? null),
      stops:    this._formatStops(seg.FlightDetail?.Stops ?? {}),
    };
  }

  /** @private */
  _formatOriginDestination(od) {
    return {
      key:             od.OriginDestinationKey   ?? null,
      origin:          od.DepartureCode?.value   ?? null,
      destination:     od.ArrivalCode?.value      ?? null,
      flightReferences: od.FlightReferences?.value ?? [],
    };
  }

  /** @private */
  _formatOperatingCarrier(carrier) {
    if (!carrier || !Object.keys(carrier).length) return null;
    return {
      code:        carrier.AirlineID?.value    ?? null,
      name:        carrier.Name                ?? null,
      flightNumber: carrier.FlightNumber?.value ?? null,
      disclosures: carrier.Disclosures?.Description?.[0]?.Text?.value ?? null,
    };
  }

  /** @private */
  _formatStops(stops) {
    return {
      count:     stops.StopQuantity ?? 0,
      locations: (stops.StopLocations?.StopLocation ?? []).map(loc => ({
        airport:       loc.AirportCode?.value ?? null,
        arrivalTime:   loc.ArrivalTime        ?? null,
        departureTime: loc.DepartureTime      ?? null,
        duration:      loc.Duration           ?? null,
      })),
    };
  }

  /** @private */
  _formatTimeLimit(timeLimit) {
    if (!timeLimit || !Object.keys(timeLimit).length) return null;
    return {
      expirationDateTime: this._formatDateTime(timeLimit.OfferExpiration?.DateTime ?? null),
      price:              this._formatPrice(timeLimit.Price ?? {}),
      guaranteed:         timeLimit.Guaranteed ?? false,
    };
  }

  /** @private */
  _formatCommission(commission) {
    return (Array.isArray(commission) ? commission : []).map(comm => ({
      amount: {
        value:    parseFloat(comm.Amount?.value ?? 0),
        currency: comm.Amount?.code ?? null,
      },
      percentage: comm.Percentage ?? null,
      code:       comm.Code       ?? null,
    }));
  }

  /** @private */
  _formatPrice(price) {
    if (!price || !Object.keys(price).length) return null;

    if (price.SimpleCurrencyPrice) {
      const currency = price.SimpleCurrencyPrice.Code ?? 'INR';
      return {
        amount:   this._formatAmount(parseFloat(price.SimpleCurrencyPrice.value ?? 0), currency),
        currency,
      };
    }

    const currency = price.TotalAmount?.Code ?? 'INR';
    return {
      amount:   this._formatAmount(parseFloat(price.TotalAmount?.value ?? 0), currency),
      currency,
      base: {
        amount:   this._formatAmount(parseFloat(price.BaseAmount?.value ?? 0), currency),
        currency,
      },
      taxes: this._formatTaxes(price.Taxes ?? {}, currency),
    };
  }

  /** @private */
  _formatTaxes(taxes, currency) {
    return (taxes.Tax ?? []).map(tax => {
      const taxCurrency = tax.Amount?.Code ?? currency;
      return {
        code:     tax.TaxCode ?? null,
        amount:   this._formatAmount(parseFloat(tax.Amount?.value ?? 0), taxCurrency),
        currency: taxCurrency,
      };
    });
  }

  /** @private */
  _formatSurcharges(surcharges) {
    return (surcharges.Surcharge ?? []).map(s => ({
      total: {
        amount:   parseFloat(s.Total?.value ?? 0),
        currency: s.Total?.Code ?? null,
      },
      breakdown: (s.Breakdown?.Fee ?? []).map(fee => ({
        amount: {
          value:    parseFloat(fee.Amount?.value ?? 0),
          currency: fee.Amount?.Code ?? null,
        },
        designator:  fee.Designator  ?? null,
        description: fee.Description ?? null,
        feeOwner:    fee.FeeOwner    ?? null,
        feePercent:  parseFloat(fee.FeePercent ?? 0),
      })),
    }));
  }

  /** @private */
  _formatFees(fees) {
    if (!fees.Total && !fees.Breakdown) return [];
    return {
      total: {
        amount:   parseFloat(fees.Total?.value ?? 0),
        currency: fees.Total?.Code ?? null,
      },
      breakdown: (fees.Breakdown?.Fee ?? []).map(fee => ({
        amount: {
          value:    parseFloat(fee.Amount?.value ?? 0),
          currency: fee.Amount?.Code ?? null,
        },
        feeName:   fee.FeeName   ?? null,
        feeCode:   fee.FeeCode   ?? null,
        feeOwner:  fee.FeeOwner  ?? null,
        feePercent: parseFloat(fee.FeePercent ?? 0),
        refundInd: fee.RefundInd ?? false,
      })),
    };
  }

  /** @private */
  _formatPieceAllowance(pieceAllowance) {
    return pieceAllowance.map(p => ({
      applicableParty: p.ApplicableParty ?? null,
      totalQuantity:   p.TotalQuantity   ?? 0,
      measurements: (p.PieceMeasurements ?? []).map(m => ({
        quantity:   m.Quantity   ?? 0,
        weight:     m.Weight     ?? null,
        dimensions: m.Dimensions ?? null,
      })),
      combination: p.PieceAllowanceCombination ?? null,
      applicableBag: p.ApplicableBag           ?? null,
    }));
  }

  /** @private */
  _formatWeightAllowance(weightAllowance) {
    if (!weightAllowance || !Object.keys(weightAllowance).length) return [];
    return {
      applicableParty: weightAllowance.ApplicableParty ?? null,
      maximumWeight: (weightAllowance.MaximumWeight ?? []).map(w => ({
        value: parseFloat(w.Value ?? 0),
        unit:  w.UOM ?? null,
      })),
    };
  }

  /** @private */
  _formatAllowanceDescription(desc) {
    if (!desc || !Object.keys(desc).length) return [];
    return {
      applicableParty: desc.ApplicableParty ?? null,
      descriptions: (desc.Descriptions?.Description ?? []).map(d => d.Text?.value ?? null),
    };
  }

  /** @private */
  _formatPenaltyAmounts(amounts) {
    return (amounts.Amount ?? []).map(amount => ({
      amount: {
        value:    parseFloat(amount.CurrencyAmountValue?.value ?? 0),
        currency: amount.CurrencyAmountValue?.Code ?? null,
      },
      application: amount.AmountApplication ?? null,
      remarks: (amount.ApplicableFeeRemarks?.Remark ?? []).map(r => r.value ?? null),
    }));
  }

  /** @private */
  _formatMedia(media) {
    return (Array.isArray(media) ? media : []).map(item => {
      if (item.MediaRef?.ref) {
        const ref = this._mediaReferences[item.MediaRef.ref] ?? null;
        if (ref) {
          return { reference: item.MediaRef.ref, links: ref.links, descriptions: ref.descriptions };
        }
      }
      return {
        links: item.MediaLinks ? this._formatMediaLinks(item.MediaLinks) : [],
        descriptions: (item.Descriptions?.Description ?? []).map(d => d.Text?.value ?? null),
      };
    });
  }

  /** @private */
  _formatMediaLinks(mediaLinks) {
    const out = {};
    for (const link of (mediaLinks ?? [])) {
      out[link.Size] = { url: link.Url ?? null, type: link.Type ?? null, size: link.Size ?? null };
    }
    return out;
  }

  /** @private */
  _formatAugmentationPoints(augPoints) {
    const out = {};
    for (const point of augPoints) {
      if (point.any?.VdcAugPoint) {
        for (const vdcPoint of point.any.VdcAugPoint) {
          if (!out[point.Key]) out[point.Key] = [];
          out[point.Key].push({ key: vdcPoint.Key ?? null, values: vdcPoint.Values ?? [] });
        }
      }
    }
    return out;
  }

  /** @private */
  _extractFareType(fare) {
    for (const remark of fare.Fare?.FareDetail?.Remarks?.Remark ?? []) {
      if (remark.value) return remark.value;
    }
    return null;
  }

  /** @private */
  _determineErrorSeverity(error) {
    if (CRITICAL_CODES.has(error.code)) return 'critical';
    if (WARNING_CODES.has(error.code))  return 'warning';
    return 'info';
  }

  /** @private */
  _getErrorSuggestion(error) {
    return ERROR_SUGGESTIONS[error.code] ?? 'Contact support for assistance';
  }

  /** @private */
  _getCheckedBaggageAllowance() {
    return (this.data?.DataLists?.CheckedBagAllowanceList?.CheckedBagAllowance ?? []).map(a => ({
      listKey:         a.ListKey ?? null,
      pieceAllowance:  this._formatPieceAllowance(a.PieceAllowance  ?? []),
      weightAllowance: this._formatWeightAllowance(a.WeightAllowance ?? {}),
      description:     this._formatAllowanceDescription(a.AllowanceDescription ?? {}),
    }));
  }

  /** @private */
  _getCarryOnBaggageAllowance() {
    return (this.data?.DataLists?.CarryOnAllowanceList?.CarryOnAllowance ?? []).map(a => ({
      listKey:         a.ListKey ?? null,
      pieceAllowance:  this._formatPieceAllowance(a.PieceAllowance  ?? []),
      weightAllowance: this._formatWeightAllowance(a.WeightAllowance ?? {}),
      description:     this._formatAllowanceDescription(a.AllowanceDescription ?? {}),
    }));
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
  _formatAmount(amount, currency) {
    const decimals = this._currencyDecimals[currency] ?? 2;
    return parseFloat(amount.toFixed(decimals));
  }

  /** @private */
  _getResponseTimestamp() {
    return this.data?.Metadata?.Timestamp ?? null;
  }

  /** @private */
  _extractCurrencyMetadata() {
    const currencies = {};
    for (const meta of this.data?.Metadata?.Other?.OtherMetadata ?? []) {
      for (const currency of meta.CurrencyMetadatas?.CurrencyMetadata ?? []) {
        currencies[currency.MetadataKey] = { decimals: currency.Decimals ?? 2 };
      }
    }
    return currencies;
  }

  /** @private */
  _initializeCurrencyDecimals() {
    for (const meta of this.data?.Metadata?.Other?.OtherMetadata ?? []) {
      for (const currency of meta.CurrencyMetadatas?.CurrencyMetadata ?? []) {
        const m = currency.MetadataKey?.match(/[A-Z]{3}$/);
        if (m) this._currencyDecimals[m[0]] = currency.Decimals;
      }
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
}

export default AirShoppingResponse;
