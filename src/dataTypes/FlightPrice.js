/**
 * @fileoverview DataType builder for the Verteil FlightPrice endpoint.
 *
 * Constructs the full NDC pricing request from caller-supplied parameters,
 * assembling DataLists (fares, anonymous/recognised travelers), the Query
 * (origin/destinations + offers with optional seat selections), Travelers,
 * ShoppingResponseID, Party, Parameters, Qualifier, and Metadata.
 */

/**
 * @class FlightPrice
 * @description Static factory for building FlightPrice request bodies.
 */
class FlightPrice {
  /**
   * Builds the top-level FlightPrice request object.
   *
   * @param {Object} [params={}]
   * @param {Object}  [params.dataLists]          - Fare and traveler data lists.
   * @param {Object}  [params.query]              - OD flights + offer references.
   * @param {Array}   [params.travelers]           - Traveler list (recognised/anonymous).
   * @param {Object}  [params.shoppingResponseId] - Shopping response link.
   * @param {Object}  [params.party]              - Corporate sender party.
   * @param {Object}  [params.parameters]         - Override currency / pricing params.
   * @param {Object}  [params.qualifier]          - Program / card qualifiers.
   * @param {Array}   [params.metadata]           - Optional metadata blocks.
   * @returns {Object} FlightPrice NDC request body.
   */
  static create(params = {}) {
    const request = {};

    if (params.dataLists && Object.keys(params.dataLists).length > 0) {
      request.DataLists = FlightPrice._createDataLists(params.dataLists);
    }

    if (params.query && Object.keys(params.query).length > 0) {
      request.Query = FlightPrice._createQuery(params.query);
    }

    if (Array.isArray(params.travelers) && params.travelers.length > 0) {
      request.Travelers = FlightPrice._createTravelers(params.travelers);
    }

    if (params.shoppingResponseId?.owner && params.shoppingResponseId?.responseId) {
      request.ShoppingResponseID = FlightPrice._createShoppingResponseId(params.shoppingResponseId);
    }

    if (params.party != null) {
      request.Party = FlightPrice._createParty(params.party);
    }

    if (params.parameters != null) {
      request.Parameters = FlightPrice._createParameters(params.parameters);
    }

    if (params.qualifier != null) {
      request.Qualifier = FlightPrice._createQualifier(params.qualifier);
    }

    if (Array.isArray(params.metadata) && params.metadata.length > 0) {
      request.Metadata = FlightPrice._createMetadata(params.metadata);
    }

    return request;
  }

  // ── Data lists ─────────────────────────────────────────────────────────────

  /** @private */
  static _createDataLists(params) {
    const dataLists = {};

    if (Array.isArray(params.fares) && params.fares.length > 0) {
      dataLists.FareList = {
        FareGroup: params.fares.map(fare => {
          const group = {
            ListKey:       fare.listKey,
            FareBasisCode: { Code: fare.code },
            Fare: {
              FareCode: { Code: fare.fareCode },
            },
          };

          if (Array.isArray(fare.refs) && fare.refs.length > 0) {
            group.refs = fare.refs;
          } else if (fare.refs != null) {
            group.refs = [fare.refs];
          }

          return group;
        }),
      };
    }

    if (Array.isArray(params.anonymousTravelers) && params.anonymousTravelers.length > 0) {
      dataLists.AnonymousTravelerList = {
        AnonymousTraveler: params.anonymousTravelers.map(traveler => {
          const t = {
            ObjectKey: traveler.objectKey,
            PTC:       { value: traveler.passengerType },
          };

          if (traveler.age) {
            t.Age = {
              Value:     { value: traveler.age.value },
              BirthDate: { value: traveler.age.birthDate },
            };
          }

          return t;
        }),
      };
    }

    if (Array.isArray(params.recognizedTravelers) && params.recognizedTravelers.length > 0) {
      dataLists.RecognizedTravelerList = {
        RecognizedTraveler: params.recognizedTravelers.map(traveler => ({
          ObjectKey: traveler.objectKey,
          PTC:       { value: traveler.passengerType },
          FQTVs:     (traveler.frequentFlyer ?? []).map(fqtv => ({
            AirlineID: { value: fqtv.airlineCode },
            Account:   {
              Number: [{ value: fqtv.accountNumber }],
            },
            ProgramID: fqtv.programId ?? null,
          })),
          Name: traveler.name ? {
            Given:   [traveler.name.given].flat().map(g => ({ value: g })),
            Surname: { value: traveler.name.surname },
          } : null,
        })),
      };
    }

    return dataLists;
  }

  // ── Query ───────────────────────────────────────────────────────────────────

  /** @private */
  static _createQuery(params) {
    return {
      OriginDestination: (params.originDestinations ?? []).map(od => ({
        Flight: (od.flights ?? []).map(flight => {
          const data = {
            SegmentKey:       flight.segmentKey,
            Departure:        FlightPrice._createDepartureArrival(flight.departure),
            Arrival:          FlightPrice._createDepartureArrival(flight.arrival),
            MarketingCarrier: {
              AirlineID:    { value: flight.airlineCode },
              FlightNumber: { value: flight.flightNumber },
            },
          };

          if (flight.operatingCarrier) {
            data.OperatingCarrier = {
              AirlineID:    { value: flight.operatingCarrier.airlineCode },
              FlightNumber: { value: flight.operatingCarrier.flightNumber },
            };
          }

          if (flight.classOfService != null) {
            data.ClassOfService = {
              Code: { value: flight.classOfService },
              refs: flight.classOfServiceRefs ?? [],
            };
          }

          if (flight.segmentType != null) {
            data.SegmentType = flight.segmentType;
          }

          return data;
        }),
      })),
      Offers: {
        Offer: (params.offers ?? []).map(offer => {
          const offerData = {
            OfferID: {
              Owner:   offer.owner,
              Channel: offer.channel ?? 'NDC',
              value:   offer.offerId,
            },
            OfferItemIDs: {
              OfferItemID: (offer.offerItems ?? []).map(item => {
                const itemData = { value: item.id };

                if (item.refs != null) {
                  itemData.refs = item.refs;
                }

                if (Array.isArray(item.selectedSeats)) {
                  itemData.SelectedSeat = item.selectedSeats.map(seat => ({
                    SeatAssociation: {
                      SegmentReferences: { value: seat.segmentRefs },
                      TravelerReference: seat.travelerRef,
                    },
                    Location: {
                      Column: seat.column,
                      Row:    { Number: { value: seat.row } },
                    },
                  }));
                }

                return itemData;
              }),
            },
          };

          if (Array.isArray(offer.refs)) {
            offerData.refs = offer.refs.map(ref => ({ Ref: ref }));
          }

          return offerData;
        }),
      },
    };
  }

  /** @private */
  static _createDepartureArrival(params) {
    const data = {
      AirportCode: { value: params.airportCode },
      Date:        params.date,
    };

    if (params.time        != null) data.Time        = params.time;
    if (params.terminal    != null) data.Terminal    = { Name: params.terminal };
    if (params.cityName    != null) data.CityName    = params.cityName;
    if (params.countryName != null) data.CountryName = params.countryName;
    if (params.airportName != null) data.AirportName = params.airportName;

    return data;
  }

  // ── Travelers ───────────────────────────────────────────────────────────────

  /** @private */
  static _createTravelers(travelers) {
    return {
      Traveler: travelers.map(traveler => {
        if (traveler.frequentFlyer) {
          return {
            RecognizedTraveler: {
              ObjectKey: traveler.objectKey,
              PTC:       { value: traveler.passengerType },
              FQTVs:     [{
                AirlineID: { value: traveler.frequentFlyer.airlineCode },
                Account:   { Number: { value: traveler.frequentFlyer.accountNumber } },
                ProgramID: traveler.frequentFlyer.programId ?? null,
              }],
              Name: traveler.name ? {
                Given:   [traveler.name.given].flat().map(g => ({ value: g })),
                Surname: { value: traveler.name.surname },
              } : null,
            },
          };
        }

        return {
          AnonymousTraveler: [{
            PTC: { value: traveler.passengerType },
          }],
        };
      }),
    };
  }

  // ── Shopping response ID ────────────────────────────────────────────────────

  /** @private */
  static _createShoppingResponseId(params) {
    return {
      Owner:      params.owner,
      ResponseID: { value: params.responseId },
    };
  }

  // ── Party ───────────────────────────────────────────────────────────────────

  /** @private */
  static _createParty(params) {
    const corporate = { CorporateCode: params.corporateCode };

    if (params.name       != null) corporate.Name       = params.name;
    if (params.department != null) corporate.Department = { Name: params.department };
    if (params.contact) {
      corporate.ContactInfo = {
        EmailContact: {
          Address: { value: params.contact.email },
        },
        PhoneContact: {
          Number: {
            CountryCode: params.contact.phoneCountryCode,
            value:       params.contact.phoneNumber,
          },
        },
      };
    }

    return {
      Sender: {
        CorporateSender: Object.fromEntries(
          Object.entries(corporate).filter(([, v]) => v != null),
        ),
      },
    };
  }

  // ── Parameters ──────────────────────────────────────────────────────────────

  /** @private */
  static _createParameters(params) {
    return {
      Pricing: {
        OverrideCurrency: params.currency,
      },
    };
  }

  // ── Qualifier ───────────────────────────────────────────────────────────────

  /** @private */
  static _createQualifier(params) {
    const qualifier = {};

    if (Array.isArray(params.programQualifiers) && params.programQualifiers.length > 0) {
      qualifier.ProgramQualifiers = {
        ProgramQualifier: params.programQualifiers.map(prog => ({
          DiscountProgramQualifier: {
            Account:   { value: prog.promoCode },
            AssocCode: { value: prog.airlineCode },
            Name:      { value: 'PROMOCODE' },
          },
        })),
      };
    }

    if (params.paymentCard) {
      const card = {};
      if (params.paymentCard.productType != null) card.cardProductTypeCode = params.paymentCard.productType;
      if (params.paymentCard.brandCode   != null) card.cardBrandCode       = params.paymentCard.brandCode;
      if (params.paymentCard.number      != null) card.cardNumber          = params.paymentCard.number;
      qualifier.PaymentCardQualifier = card;
    }

    return qualifier;
  }

  // ── Metadata ────────────────────────────────────────────────────────────────

  /** @private */
  static _createMetadata(metadata) {
    return {
      Other: {
        OtherMetadata: metadata.map(meta => {
          const item = {};

          if (Array.isArray(meta.priceMetadata)) {
            item.PriceMetadatas = {
              PriceMetadata: meta.priceMetadata.map(price => ({
                MetadataKey: price.key,
                AugmentationPoint: {
                  AugPoint: [{
                    any: Object.fromEntries(
                      Object.entries({
                        '@type': price.type     ?? null,
                        type:    price.javaType ?? null,
                        value:   price.value,
                      }).filter(([, v]) => v != null),
                    ),
                  }],
                },
              })),
            };
          }

          return item;
        }),
      },
    };
  }
}

export default FlightPrice;
