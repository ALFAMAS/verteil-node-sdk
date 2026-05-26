/**
 * @fileoverview DataType builder for the Verteil SeatAvailability endpoint.
 *
 * Supports both pre-booking (anonymous traveler + offer context) and
 * post-booking (order-based) seat-availability queries.
 */

/**
 * @class SeatAvailability
 * @description Static factory for building SeatAvailability request bodies.
 */
class SeatAvailability {
  /**
   * Builds the top-level SeatAvailability request object.
   *
   * @param {'pre'|'post'} type    - Query mode: 'post' uses an order ID; 'pre' uses offer context.
   * @param {Object}       [params={}]
   *
   * **Post mode:**
   * @param {string} params.owner   - Airline IATA code.
   * @param {string} params.orderId - PNR / order reference.
   *
   * **Pre mode:**
   * @param {Object}   params.query               - Origin/destination + offer context.
   * @param {Object}   [params.dataLists]          - Fare and flight-segment data lists.
   * @param {Array}    [params.travelers]           - Anonymous traveler list.
   * @param {Object}   [params.shoppingResponseId] - Shopping response link.
   * @returns {Object} SeatAvailability NDC request body.
   */
  static create(type, params = {}) {
    if (type === 'post') {
      return {
        Query: {
          OrderID: {
            Owner: params.owner,
            value: params.orderId,
          },
        },
      };
    }

    return {
      Query:             SeatAvailability._createQuery(params.query ?? {}),
      DataLists:         SeatAvailability._createDataLists(params.dataLists ?? {}),
      Travelers:         SeatAvailability._createTravelers(params.travelers ?? []),
      ShoppingResponseID: SeatAvailability._createShoppingResponseId(params.shoppingResponseId ?? {}),
    };
  }

  /** @private */
  static _createQuery(params) {
    return {
      OriginDestination: (params.originDestinations ?? []).map(od => ({
        FlightSegmentReference: (od.segmentRefs ?? []).map(ref => ({ ref })),
      })),
      Offers: {
        Offer: (params.offers ?? []).map(offer => ({
          OfferID: {
            Owner: offer.owner,
            value: offer.offerId,
          },
          OfferItemIDs: {
            OfferItemID: (offer.offerItems ?? []).map(item => ({ value: item })),
          },
        })),
      },
    };
  }

  /** @private */
  static _createDataLists(params) {
    return {
      FareList: {
        FareGroup: (params.fares ?? []).map(fare => ({
          ListKey:       fare.listKey,
          FareBasisCode: { Code: fare.code },
        })),
      },
      FlightSegmentList: {
        FlightSegment: (params.segments ?? []).map(segment => ({
          SegmentKey: segment.segmentKey,
          Departure: {
            AirportCode: { value: segment.departureAirport },
            Date:        segment.departureDate,
            Time:        segment.departureTime,
          },
          Arrival: {
            AirportCode: { value: segment.arrivalAirport },
            Date:        segment.arrivalDate,
            Time:        segment.arrivalTime,
          },
          MarketingCarrier: {
            AirlineID:    { value: segment.airlineCode },
            FlightNumber: { value: segment.flightNumber },
          },
        })),
      },
    };
  }

  /** @private */
  static _createTravelers(travelers) {
    return {
      Traveler: travelers.map(traveler => ({
        AnonymousTraveler: [{
          ObjectKey: traveler.objectKey,
          PTC:       { value: traveler.passengerType },
        }],
      })),
    };
  }

  /** @private */
  static _createShoppingResponseId(params) {
    return {
      ResponseID: { value: params.responseId },
    };
  }
}

export default SeatAvailability;
