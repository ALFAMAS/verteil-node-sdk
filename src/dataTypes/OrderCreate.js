/**
 * @fileoverview DataType builder for the Verteil OrderCreate endpoint.
 *
 * Constructs the full NDC order-creation payload, assembling order items
 * (detailed flights, seats, ancillaries), fare data lists, passenger records,
 * payments, commission, metadata, and optional party information.
 */

/**
 * @class OrderCreate
 * @description Static factory for building OrderCreate request bodies.
 */
class OrderCreate {
  /**
   * Builds the top-level OrderCreate request object.
   *
   * @param {Object} [params={}]
   * @param {Object}  [params.query]      - Core query (orderItems, dataLists, passengers).
   * @param {Array}   [params.payments]   - Payment method(s) for the order.
   * @param {Object}  [params.commission] - Commission details.
   * @param {Object}  [params.metadata]   - Currency / price / passenger metadata.
   * @param {Object}  [params.party]      - Corporate sender party.
   * @returns {Object} OrderCreate NDC request body.
   */
  static create(params = {}) {
    const query = OrderCreate._createQuery(params.query ?? {});

    if (Array.isArray(params.payments) && params.payments.length > 0) {
      query.Payments = OrderCreate._createPayments(params.payments);
    }

    if (params.commission != null && Object.keys(params.commission).length > 0) {
      query.Commission = params.commission;
    }

    if (params.metadata != null && Object.keys(params.metadata).length > 0) {
      query.Metadata = OrderCreate._createMetadata(params.metadata);
    }

    const result = { Query: query };

    if (params.party != null && Object.keys(params.party).length > 0) {
      const party = OrderCreate._createParty(params.party);
      if (party != null) result.Party = party;
    }

    return result;
  }

  // ── Query ───────────────────────────────────────────────────────────────────

  /** @private */
  static _createQuery(params) {
    return {
      OrderItems:  OrderCreate._createOrderItems(params.orderItems ?? {}),
      DataLists:   OrderCreate._createDataLists(params.dataLists   ?? {}),
      Passengers:  OrderCreate._createPassengers(params.passengers  ?? []),
    };
  }

  // ── Order items ─────────────────────────────────────────────────────────────

  /** @private */
  static _createOrderItems(params) {
    const items = {};

    if (params.shoppingResponse && Object.keys(params.shoppingResponse).length > 0) {
      const sr = params.shoppingResponse;
      const built = {
        Owner:      sr.owner ?? '',
        ResponseID: { value: sr.responseId ?? '' },
        Offers: {
          Offer: (sr.offers?.Offer ?? []).map(offer => {
            const o = {
              OfferID: {
                Owner:     offer.owner     ?? '',
                Channel:   offer.channel   ?? 'NDC',
                ObjectKey: offer.objectKey ?? '',
                value:     offer.offerId   ?? '',
              },
              OfferItems: {
                OfferItem: (offer.offerItems ?? []).map(item => ({
                  OfferItemID: {
                    Owner: item.owner  ?? '',
                    value: item.offerId ?? '',
                  },
                })),
              },
            };
            return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
          }),
        },
      };
      items.ShoppingResponse = Object.fromEntries(
        Object.entries(built).filter(([, v]) => v != null),
      );
    }

    if (Array.isArray(params.offerItem) && params.offerItem.length > 0) {
      items.OfferItem = params.offerItem.map((item, index) => {
        const isFirstPassenger = index === 0;
        const built = {
          OfferItemID: {
            Owner:   item.owner   ?? '',
            value:   item.value   ?? '',
            Channel: item.channel ?? 'NDC',
          },
          OfferItemType: OrderCreate._createOfferItemType(item, isFirstPassenger),
        };
        return Object.fromEntries(Object.entries(built).filter(([, v]) => v != null));
      });
    }

    return items;
  }

  /** @private */
  static _createOfferItemType(item, isFirstPassenger) {
    const offerItemType = {};

    if (item.detailedFlightItem) {
      offerItemType.DetailedFlightItem = item.detailedFlightItem.map(flight => {
        const data = {
          Price:             OrderCreate._createPrice(flight.price ?? {}),
          OriginDestination: OrderCreate._createOriginDestination(
            flight.originDestination ?? [],
            isFirstPassenger,
          ),
        };

        if (Array.isArray(flight.refs) && flight.refs.length > 0) {
          data.refs = flight.refs;
        }

        return Object.fromEntries(Object.entries(data).filter(([, v]) => v != null));
      });
    }

    if (item.seatItem) {
      offerItemType.SeatItem = item.seatItem.map(seat => {
        const s = {
          Price: OrderCreate._createPrice(seat.price ?? {}),
          SeatAssociation: (seat.associations ?? []).map(assoc => ({
            SegmentReferences: { value: assoc.segmentRef ?? '' },
            TravelerReference: assoc.travelerRef ?? '',
          })),
          Location: OrderCreate._createSeatLocation(seat.location ?? {}),
        };

        if (Array.isArray(seat.descriptions)) {
          s.Descriptions = {
            Description: seat.descriptions.map(desc => ({
              Text: { value: desc },
            })),
          };
        }

        return s;
      });
    }

    if (item.otherItem) {
      offerItemType.OtherItem = item.otherItem.map(other => ({
        refs:  other.refs ?? [],
        Price: {
          SimpleCurrencyPrice: {
            value: other.price?.amount   ?? 0,
            Code:  other.price?.currency ?? 'INR',
          },
        },
      }));
    }

    return offerItemType;
  }

  /** @private */
  static _createPrice(price) {
    const built = {
      BaseAmount: {
        value: price.baseAmount ?? 0,
        Code:  price.currency   ?? 'INR',
      },
      Taxes: {
        Total: {
          value: price.taxAmount ?? 0,
          Code:  price.currency  ?? 'INR',
        },
      },
    };
    return Object.fromEntries(Object.entries(built).filter(([, v]) => v != null));
  }

  /** @private */
  static _createOriginDestination(ods, isFirstPassenger) {
    return ods.map(od => {
      const odData = {
        Flight: (od.flights ?? []).map(flight => {
          const flightData = {
            Departure: {
              AirportCode: { value: flight.departure?.airport ?? '' },
              Date:        flight.departure?.date ?? '',
              Time:        flight.departure?.time ?? null,
              Terminal:    flight.departure?.terminal
                ? { Name: flight.departure.terminal }
                : null,
            },
            Arrival: {
              AirportCode: { value: flight.arrival?.airport ?? '' },
              Date:        flight.arrival?.date ?? null,
              Time:        flight.arrival?.time ?? null,
              Terminal:    flight.arrival?.terminal
                ? { Name: flight.arrival.terminal }
                : null,
            },
            MarketingCarrier: {
              AirlineID:    { value: flight.airline       ?? '' },
              FlightNumber: { value: flight.flightNumber  ?? '' },
            },
          };

          if (isFirstPassenger && flight.segmentKey != null) {
            flightData.SegmentKey = flight.segmentKey;
          }

          if (flight.operatingCarrier && Object.keys(flight.operatingCarrier).length > 0) {
            flightData.OperatingCarrier = {
              AirlineID:    { value: flight.operatingCarrier.airline       ?? '' },
              FlightNumber: { value: flight.operatingCarrier.flightNumber  ?? '' },
            };
          }

          if (flight.classOfService != null) {
            const cos = { Code: { value: flight.classOfService } };

            if (flight.marketingName && Object.keys(flight.marketingName).length > 0) {
              const mn = { value: flight.marketingName.value };
              if (flight.marketingName.cabinDesignator != null) {
                mn.CabinDesignator = flight.marketingName.cabinDesignator;
              }
              cos.MarketingName = mn;
            }

            if (Array.isArray(flight.classOfServiceRefs) && flight.classOfServiceRefs.length > 0) {
              cos.refs = flight.classOfServiceRefs;
            }

            flightData.ClassOfService = Object.fromEntries(
              Object.entries(cos).filter(([, v]) => v != null),
            );
          }

          return Object.fromEntries(
            Object.entries(flightData).filter(([, v]) => v != null),
          );
        }),
      };

      if (isFirstPassenger && od.originDestinationKey != null) {
        odData.OriginDestinationKey = od.originDestinationKey;
      }

      return odData;
    });
  }

  /** @private */
  static _createSeatLocation(location) {
    return {
      Column: location.column ?? '',
      Row:    { Number: { value: location.row ?? '' } },
      Characteristics: Array.isArray(location.characteristics) ? {
        Characteristic: location.characteristics.map(char => ({
          Code:    char.code ?? '',
          Remarks: Array.isArray(char.remarks) ? {
            Remark: char.remarks.map(remark => ({ value: remark })),
          } : null,
        })),
      } : null,
    };
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

    if (Array.isArray(params.services) && params.services.length > 0) {
      dataLists.ServiceList = {
        Service: params.services.map(service => ({
          ServiceID: {
            Owner: service.owner     ?? '',
            value: service.serviceId ?? '',
          },
          Name: { value: service.name ?? '' },
          Descriptions: Array.isArray(service.descriptions) ? {
            Description: service.descriptions.map(desc => ({
              Text: { value: desc },
            })),
          } : null,
          Price: (service.prices ?? []).map(price => ({
            Total: {
              value: price.amount   ?? 0,
              Code:  price.currency ?? 'INR',
            },
          })),
          PricedInd: service.priced ?? false,
        })),
      };
    }

    return dataLists;
  }

  // ── Passengers ──────────────────────────────────────────────────────────────

  /** @private */
  static _createPassengers(passengers) {
    return {
      Passenger: passengers.map(passenger => {
        const p = {
          ObjectKey: passenger.objectKey ?? '',
          Name: {
            Given: [passenger.name?.given ?? []].flat().map(g => ({ value: g })),
            Surname: { value: passenger.name?.surname ?? '' },
            Title:   passenger.name?.title ?? null,
          },
        };

        if (passenger.passengerType != null) {
          p.PTC = { value: passenger.passengerType };
        }

        if (passenger.gender != null) {
          p.Gender = { value: passenger.gender };
        }

        if (passenger.birthDate != null) {
          p.Age = { BirthDate: { value: passenger.birthDate } };
        }

        if (passenger.passengerAssociation != null) {
          p.PassengerAssociation = passenger.passengerAssociation;
        }

        if (passenger.contacts) {
          p.Contacts = {
            Contact: [{
              PhoneContact: {
                Number: [{
                  CountryCode: passenger.contacts.phone?.countryCode ?? '',
                  value:       passenger.contacts.phone?.number      ?? '',
                }],
              },
              EmailContact: {
                Address: { value: passenger.contacts.email ?? '' },
              },
              AddressContact: {
                Street:      [passenger.contacts.address?.street      ?? ''],
                PostalCode:  passenger.contacts.address?.postalCode   ?? '',
                CityName:    passenger.contacts.address?.city         ?? '',
                CountryCode: { value: passenger.contacts.address?.countryCode ?? '' },
              },
            }],
          };
        }

        if (passenger.document) {
          p.PassengerIDInfo = {
            PassengerDocument: [{
              Type:               passenger.document.type             ?? '',
              ID:                 passenger.document.number           ?? '',
              CountryOfIssuance:  passenger.document.issuingCountry   ?? '',
              DateOfExpiration:   passenger.document.expiryDate       ?? null,
              CountryOfResidence: passenger.document.countryOfResidence ?? null,
              DateOfIssue:        passenger.document.dateOfIssue       ?? null,
            }],
          };
        }

        if (Array.isArray(passenger.frequentFlyer) && passenger.frequentFlyer.length > 0) {
          p.FQTVs = {
            TravelerFQTV_Information: passenger.frequentFlyer.map(fqtv => ({
              AirlineID: { value: fqtv.airlineCode    ?? '' },
              Account:   { Number: { value: fqtv.accountNumber ?? '' } },
              ProgramID: fqtv.programId ?? null,
            })),
          };
        }

        return p;
      }),
    };
  }

  // ── Party ───────────────────────────────────────────────────────────────────

  /** @private */
  static _createParty(params) {
    if (!params || Object.keys(params).length === 0) return null;

    const corporate = {};

    if (params.corporateCode != null) corporate.CorporateCode = params.corporateCode;
    if (params.name          != null) corporate.Name          = params.name;
    if (params.department    != null) corporate.Department    = { Name: params.department };
    if (params.contact) {
      corporate.ContactInfo = {
        EmailContact: {
          Address: { value: params.contact.email },
        },
        PhoneContact: {
          Number: [{
            CountryCode: params.contact.phoneCountryCode,
            value:       params.contact.phoneNumber,
          }],
        },
      };
    }

    const filtered = Object.fromEntries(
      Object.entries(corporate).filter(([, v]) => v != null),
    );

    if (Object.keys(filtered).length === 0) return null;

    return {
      Sender: { CorporateSender: filtered },
    };
  }

  // ── Payments ────────────────────────────────────────────────────────────────

  /** @private */
  static _createPayments(payments) {
    if (!payments.length) return null;

    return {
      Payment: payments.map(payment => {
        const p = {
          Amount: {
            Code:  payment.currency ?? 'INR',
            value: payment.amount   ?? 0,
          },
        };

        if (payment.surcharge?.amount > 0) {
          p.Surcharge = {
            Code:  payment.surcharge.currency ?? 'INR',
            value: payment.surcharge.amount   ?? 0,
          };
        }

        p.Method = OrderCreate._createPaymentMethod(payment);

        return p;
      }),
    };
  }

  /** @private */
  static _createPaymentMethod(payment) {
    const method = {};

    if (payment.card) {
      const card = payment.card;
      const paymentCard = {
        CardNumber: { value: card.number ?? '' },
        SeriesCode: card.cvv != null ? { value: card.cvv } : null,
        CardType:   card.type   ?? 'Credit',
        CardCode:   card.brand  ?? 'VI',
        EffectiveExpireDate: { Expiration: card.expiryDate ?? '' },
        Amount: {
          value: payment.amount   ?? 0,
          Code:  payment.currency ?? 'INR',
        },
      };

      if (card.holderName != null) {
        paymentCard.CardHolderName = {
          value: card.holderName,
          refs:  card.holderRefs ?? ['Payer'],
        };
      }

      if (card.billingAddress) {
        paymentCard.CardHolderBillingAddress = {
          Street:      [card.billingAddress.street],
          PostalCode:  card.billingAddress.postalCode   ?? '',
          CityName:    card.billingAddress.city         ?? '',
          CountryCode: { value: card.billingAddress.countryCode ?? '' },
        };
      }

      paymentCard.SecurePaymentVersion2 = { PaymentTrxChannelCode: 'MO' };

      method.PaymentCard = Object.fromEntries(
        Object.entries(paymentCard).filter(([, v]) => v != null),
      );
    }

    if (payment.cash) {
      method.Cash = { CashInd: true };
    }

    if (payment.other) {
      method.Other = {
        Remarks: {
          Remark: [payment.other.remarks].flat().map(r => ({ value: r })),
        },
      };
    }

    return method;
  }

  // ── Metadata ────────────────────────────────────────────────────────────────

  /** @private */
  static _createMetadata(params) {
    if (!params || Object.keys(params).length === 0) return null;

    const metadata = {};

    if (Array.isArray(params.other) && params.other.length > 0) {
      metadata.Other = {
        OtherMetadata: params.other.map(meta => {
          const item = {};

          if (Array.isArray(meta.currencyMetadata)) {
            item.CurrencyMetadatas = {
              CurrencyMetadata: meta.currencyMetadata.map(currency => ({
                MetadataKey: currency.key,
                Decimals:    currency.decimals,
              })),
            };
          }

          if (Array.isArray(meta.priceMetadata)) {
            item.PriceMetadatas = {
              PriceMetadata: meta.priceMetadata.map(price => ({
                MetadataKey: price.key,
                AugmentationPoint: {
                  AugPoint: [{
                    any: {
                      VdcAugPoint: [{ Value: price.value }],
                    },
                  }],
                },
              })),
            };
          }

          return item;
        }),
      };
    }

    if (Array.isArray(params.passengerMetadata) && params.passengerMetadata.length > 0) {
      metadata.PassengerMetadata = params.passengerMetadata.map(passenger => ({
        AugmentationPoint: {
          AugPoint: (passenger.augmentationPoints ?? []).map(point => ({
            any: {
              VdcAugPoint: { Value: point.value },
            },
          })),
        },
        refs: passenger.refs ?? [],
      }));
    }

    return metadata;
  }
}

export default OrderCreate;
