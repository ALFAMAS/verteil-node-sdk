/**
 * @fileoverview DataType builder for the Verteil OrderReshop endpoint.
 *
 * Constructs the NDC re-shopping payload for an existing order, supporting
 * cabin/fare/service qualifiers, segment replacement hints, passenger scoping,
 * and alternate-date search flags.
 */

/**
 * @class OrderReshop
 * @description Static factory for building OrderReshop request bodies.
 */
class OrderReshop {
  /**
   * Builds the top-level OrderReshop request object.
   *
   * @param {Object} [params={}]
   * @param {string}   params.owner             - Airline IATA code.
   * @param {string}   params.orderId           - PNR / order reference.
   * @param {string}   [params.channel='NDC']   - Distribution channel.
   * @param {Array}    [params.qualifiers]       - CABIN / FARE / SERVICE qualifiers.
   * @param {Array}    [params.segments]         - Segment keys (with optional new-flight overrides).
   * @param {string[]} [params.passengerRefs]    - Passenger object-key references.
   * @param {boolean}  [params.searchAlternateDates] - Broaden search to ±3 days.
   * @param {Array}    [params.metadata]         - Optional metadata entries.
   * @returns {Object} OrderReshop NDC request body.
   */
  static create(params = {}) {
    return {
      Query:    OrderReshop._createQuery(params),
      Metadata: OrderReshop._createMetadata(params.metadata ?? []),
    };
  }

  /** @private */
  static _createQuery(params) {
    const query = {
      OrderID: {
        Owner:   params.owner,
        value:   params.orderId,
        Channel: params.channel ?? 'NDC',
      },
    };

    if (Array.isArray(params.qualifiers) && params.qualifiers.length > 0) {
      query.Qualifiers = OrderReshop._createQualifiers(params.qualifiers);
    }

    if (Array.isArray(params.segments) && params.segments.length > 0) {
      query.Segments = OrderReshop._createSegments(params.segments);
    }

    if (Array.isArray(params.passengerRefs) && params.passengerRefs.length > 0) {
      query.PassengerRefs = params.passengerRefs.map(ref => ({ value: ref }));
    }

    if (params.searchAlternateDates != null) {
      query.SearchAlternateDates = params.searchAlternateDates;
    }

    return query;
  }

  /** @private */
  static _createQualifiers(qualifiers) {
    const result = [];

    for (const qualifier of qualifiers) {
      switch (qualifier.type) {
        case 'CABIN':
          result.push({
            CabinPreference: {
              CabinType:       { Code: qualifier.cabin },
              PreferenceLevel: qualifier.preferenceLevel ?? null,
            },
          });
          break;

        case 'FARE':
          result.push({
            FarePreference: {
              Types: {
                Type: (qualifier.fareTypes ?? ['PUBL']).map(type => ({ Code: type })),
              },
              FareBasisCode: qualifier.fareBasis
                ? { Code: qualifier.fareBasis }
                : null,
            },
          });
          break;

        case 'SERVICE':
          result.push({
            ServicePreference: {
              ServiceType:        { Code: qualifier.serviceCode },
              ServiceDefinitionID: qualifier.serviceDefinitionId ?? null,
            },
          });
          break;

        default:
          break;
      }
    }

    return result;
  }

  /** @private */
  static _createSegments(segments) {
    return segments.map(segment => {
      const formatted = { SegmentKey: segment.segmentKey };

      if (segment.newFlight) {
        const nf = segment.newFlight;
        formatted.NewFlight = {
          Departure: {
            AirportCode: { value: nf.origin },
            Date:        nf.departureDate,
            Time:        nf.departureTime ?? null,
          },
          Arrival: {
            AirportCode: { value: nf.destination },
            Date:        nf.arrivalDate  ?? null,
            Time:        nf.arrivalTime  ?? null,
          },
          MarketingCarrier: {
            AirlineID:    { value: nf.airlineCode },
            FlightNumber: { value: nf.flightNumber },
          },
        };

        if (nf.operatingCarrier) {
          formatted.NewFlight.OperatingCarrier = {
            AirlineID:    { value: nf.operatingCarrier.code },
            FlightNumber: { value: nf.operatingCarrier.flightNumber },
          };
        }
      }

      return formatted;
    });
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

export default OrderReshop;
