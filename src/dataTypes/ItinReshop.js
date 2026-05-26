/**
 * @fileoverview DataType builder for the Verteil ItinReshop endpoint.
 *
 * Constructs the NDC itinerary-reshop request supporting segment changes,
 * routing changes, and date changes — with optional pricing qualifiers
 * (fare-basis, cabin, brand, loyalty, corporate) and party information.
 */

/**
 * @class ItinReshop
 * @description Static factory for building ItinReshop request bodies.
 */
class ItinReshop {
  /**
   * Builds the top-level ItinReshop request object.
   *
   * @param {Object} [params={}]
   * @param {{owner:string, value:string, channel?:string}} params.orderId
   *   Target order identifier.
   * @param {Array}   [params.itineraryChanges]   - Change directives (SEGMENT_CHANGE, etc.).
   * @param {Array}   [params.pricingQualifiers]  - Fare / cabin / brand qualifiers.
   * @param {Object}  [params.party]              - Sender party information.
   * @param {Array}   [params.metadata]           - Optional metadata entries.
   * @returns {Object} ItinReshop NDC request body.
   */
  static create(params = {}) {
    return {
      Query:    ItinReshop._createQuery(params),
      Party:    ItinReshop._createParty(params.party ?? {}),
      Metadata: ItinReshop._createMetadata(params.metadata ?? []),
    };
  }

  /** @private */
  static _createQuery(params) {
    const query = {
      OrderID: {
        Owner:   params.orderId?.owner,
        value:   params.orderId?.value,
        Channel: params.orderId?.channel ?? 'NDC',
      },
      ItineraryChanges: ItinReshop._createItineraryChanges(params.itineraryChanges ?? []),
    };

    if (Array.isArray(params.pricingQualifiers) && params.pricingQualifiers.length > 0) {
      query.PricingQualifiers = ItinReshop._createPricingQualifiers(params.pricingQualifiers);
    }

    return query;
  }

  /** @private */
  static _createItineraryChanges(changes) {
    return changes.map(change => {
      switch (change.type) {
        case 'SEGMENT_CHANGE': return ItinReshop._createSegmentChange(change);
        case 'ROUTING_CHANGE': return ItinReshop._createRoutingChange(change);
        case 'DATE_CHANGE':    return ItinReshop._createDateChange(change);
        default:               return {};
      }
    });
  }

  /** @private */
  static _createSegmentChange(change) {
    return {
      Type:       'SEGMENT_CHANGE',
      OldSegment: ItinReshop._createSegmentDetails(change.oldSegment),
      NewSegment: ItinReshop._createSegmentDetails(change.newSegment),
      RelatedSegments: Array.isArray(change.relatedSegments)
        ? change.relatedSegments.map(ref => ({ SegmentKey: ref }))
        : null,
    };
  }

  /** @private */
  static _createRoutingChange(change) {
    return {
      Type:               'ROUTING_CHANGE',
      NewRouting:         (change.newRouting ?? []).map(seg => ItinReshop._createSegmentDetails(seg)),
      PreserveConnections: change.preserveConnections ?? true,
    };
  }

  /** @private */
  static _createDateChange(change) {
    return {
      Type:             'DATE_CHANGE',
      SegmentReference: change.segmentRef,
      NewDepartureDate: change.newDate,
      NewDepartureTime: change.newTime ?? null,
      FlexibleDates: change.flexibleDates ? {
        Before: change.flexibleDates.before ?? 0,
        After:  change.flexibleDates.after  ?? 0,
      } : null,
    };
  }

  /** @private */
  static _createSegmentDetails(segment) {
    const details = {
      Departure: {
        AirportCode: { value: segment.origin },
        Date:        segment.departure.date,
        Time:        segment.departure.time     ?? null,
        Terminal:    segment.departure.terminal
          ? { Name: segment.departure.terminal }
          : null,
      },
      Arrival: {
        AirportCode: { value: segment.destination },
        Date:        segment.arrival?.date      ?? null,
        Time:        segment.arrival?.time      ?? null,
        Terminal:    segment.arrival?.terminal
          ? { Name: segment.arrival.terminal }
          : null,
      },
      MarketingCarrier: {
        AirlineID:    { value: segment.airline },
        FlightNumber: { value: segment.flightNumber },
      },
    };

    if (segment.operatingCarrier) {
      details.OperatingCarrier = {
        AirlineID:    { value: segment.operatingCarrier.airline },
        FlightNumber: { value: segment.operatingCarrier.flightNumber },
      };
    }

    if (segment.aircraft) {
      details.Equipment = { AircraftCode: segment.aircraft };
    }

    if (segment.cabin) {
      details.CabinType = { Code: segment.cabin };
    }

    if (segment.classOfService) {
      details.ClassOfService = { Code: segment.classOfService };
    }

    return details;
  }

  /** @private */
  static _createPricingQualifiers(qualifiers) {
    return qualifiers.map(qualifier => {
      switch (qualifier.type) {
        case 'FARE_BASIS':
          return {
            FareBasisCode: {
              Code:        qualifier.code,
              Application: qualifier.application ?? 'All',
              SegmentRefs: Array.isArray(qualifier.segments)
                ? qualifier.segments.map(ref => ({ value: ref }))
                : null,
            },
          };

        case 'CABIN':
          return {
            CabinType:    { Code: qualifier.code, Definition: qualifier.definition ?? null },
            PriorityCode: qualifier.priority ?? null,
          };

        case 'BRAND':
          return {
            BrandID:   { value: qualifier.brandId },
            BrandName: qualifier.brandName ?? null,
          };

        case 'LOYALTY':
          return {
            LoyaltyProgram: {
              Alliance:   qualifier.alliance  ?? null,
              CardNumber: qualifier.cardNumber,
              Carrier:    { AirlineID: { value: qualifier.airline } },
              ProgramID:  qualifier.programId ?? null,
              Tier:       qualifier.tier      ?? null,
            },
          };

        case 'CORPORATE':
          return {
            CorporateContract: {
              Code:      qualifier.code,
              Name:      qualifier.name        ?? null,
              CorpID:    qualifier.corporateId ?? null,
            },
          };

        default:
          return {};
      }
    });
  }

  /** @private */
  static _createParty(params) {
    if (!params || !params.type) return null;

    return {
      Sender: {
        [`${params.type}Sender`]: {
          Code:       params.code,
          Name:       params.name       ?? null,
          IATA:       params.iata       ? { value: params.iata } : null,
          Department: params.department ? { Name: params.department } : null,
          ContactInfo: params.contact ? {
            EmailContact: {
              Address: { value: params.contact.email },
            },
            PhoneContact: {
              Number: {
                CountryCode: params.contact.phoneCountryCode ?? '1',
                value:       params.contact.phoneNumber,
              },
            },
          } : null,
        },
      },
    };
  }

  /** @private */
  static _createMetadata(metadata) {
    if (!metadata.length) return null;

    return {
      Other: {
        OtherMetadata: metadata.map(meta => ({
          MetadataKey: meta.key,
          Value:       meta.value,
          Description: meta.description ?? null,
        })),
      },
    };
  }
}

export default ItinReshop;
