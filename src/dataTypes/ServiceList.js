/**
 * @fileoverview DataType builder for the Verteil ServiceList endpoint.
 *
 * Supports both pre-booking (shopping context) and post-booking (order-based)
 * ancillary service discovery queries.
 */

/**
 * @class ServiceList
 * @description Static factory for building ServiceList request bodies.
 */
class ServiceList {
  /**
   * Builds the top-level ServiceList request object.
   *
   * @param {'pre'|'post'} type    - Query mode.
   * @param {Object}       [params={}]
   *
   * **Post mode:**
   * @param {string} params.owner   - Airline IATA code.
   * @param {string} params.orderId - PNR / order reference.
   *
   * **Pre mode:**
   * @param {Object}  params.query               - Origin/destination + offer block.
   * @param {Array}   [params.travelers]           - Anonymous traveler list.
   * @param {Object}  [params.shoppingResponseId] - Shopping response link.
   * @param {Object}  [params.party]              - Corporate sender party.
   * @param {Object}  [params.qualifier]          - Program / promo qualifiers.
   * @returns {Object} ServiceList NDC request body.
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
      Query:             ServiceList._createQuery(params.query ?? {}),
      Travelers:         ServiceList._createTravelers(params.travelers ?? []),
      ShoppingResponseID: ServiceList._createShoppingResponseId(params.shoppingResponseId ?? {}),
      Party:             ServiceList._createParty(params.party ?? {}),
      Qualifier:         ServiceList._createQualifier(params.qualifier ?? {}),
    };
  }

  /** @private */
  static _createQuery(params) {
    return {
      OriginDestination: (params.originDestinations ?? []).map(od => ({
        Flight: (od.flights ?? []).map(flight => ({
          SegmentKey: flight.segmentKey,
          Departure: {
            AirportCode: { value: flight.departureAirport },
            Date:        flight.departureDate,
          },
          Arrival: {
            AirportCode: { value: flight.arrivalAirport },
          },
          MarketingCarrier: {
            AirlineID:    { value: flight.airlineCode },
            FlightNumber: { value: flight.flightNumber },
          },
        })),
      })),
      Offers: {
        Offer: (params.offers ?? []).map(offer => ({
          OfferID: {
            Owner: offer.owner,
            value: offer.offerId,
          },
          OfferItemIDs: {
            OfferItemID: { value: offer.offerItem },
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
          PTC: { value: traveler.passengerType },
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

  /** @private */
  static _createParty(params) {
    if (!params?.corporateCode) return null;

    return {
      Sender: {
        CorporateSender: {
          CorporateCode: params.corporateCode,
        },
      },
    };
  }

  /** @private */
  static _createQualifier(params) {
    if (!Array.isArray(params.programQualifiers) || !params.programQualifiers.length) {
      return null;
    }

    return {
      ProgramQualifiers: {
        ProgramQualifier: params.programQualifiers.map(qualifier => ({
          DiscountProgramQualifier: {
            Account:  { value: qualifier.promoCode },
            AssocCode: { value: qualifier.airlineCode },
            Name:     { value: 'PROMOCODE' },
          },
        })),
      },
    };
  }
}

export default ServiceList;
