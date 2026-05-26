/**
 * @fileoverview DataType builder for the Verteil OrderChange endpoint.
 *
 * Constructs the NDC-compliant payload for modifying an existing order,
 * including flight changes, passenger-info updates, ancillary additions,
 * and seat reassignments.
 */

/**
 * @class OrderChange
 * @description Static factory for building OrderChange request bodies.
 */
class OrderChange {
  /**
   * Builds the top-level OrderChange request object.
   *
   * @param {Object} [params={}]
   * @param {{owner:string, orderId:string, channel?:string}} params.orderId
   *   Target order identifier.
   * @param {Array<Object>} [params.changes]   - List of change directives.
   * @param {Array<Object>} [params.passengers] - Updated passenger records.
   * @param {Array<Object>} [params.payments]   - Payment method(s) for fees.
   * @param {string}        [params.correlationId] - Client correlation ID.
   * @returns {Object} OrderChange NDC request body.
   */
  static create(params = {}) {
    return {
      Query: {
        OrderID: OrderChange._createOrderId(params.orderId ?? {}),
        Changes: OrderChange._createChanges(params.changes ?? []),
      },
      Passengers: OrderChange._createPassengers(params.passengers ?? []),
      Payments:   OrderChange._createPayments(params.payments ?? []),
      CorrelationID: params.correlationId ?? null,
    };
  }

  /** @private */
  static _createOrderId(params) {
    return {
      Owner:   params.owner,
      value:   params.orderId,
      Channel: params.channel ?? 'NDC',
    };
  }

  /** @private */
  static _createChanges(changes) {
    return changes.map(change => {
      switch (change.type) {
        case 'FLIGHT_CHANGE':   return OrderChange._createFlightChange(change);
        case 'ADD_SERVICE':     return OrderChange._createServiceChange(change);
        case 'PASSENGER_INFO':  return OrderChange._createPassengerChange(change);
        case 'SEAT_CHANGE':     return OrderChange._createSeatChange(change);
        default:                return {};
      }
    });
  }

  /** @private */
  static _createFlightChange(change) {
    return {
      ChangeType: 'FLIGHT_CHANGE',
      FlightDetails: (change.segments ?? []).map(segment => {
        const detail = {
          Departure: {
            AirportCode: { value: segment.origin },
            Date:        segment.departureDate,
            Time:        segment.departureTime ?? null,
          },
          Arrival: {
            AirportCode: { value: segment.destination },
            Date:        segment.arrivalDate  ?? null,
            Time:        segment.arrivalTime  ?? null,
          },
          MarketingCarrier: {
            AirlineID:    { value: segment.airlineCode },
            FlightNumber: { value: segment.flightNumber },
          },
        };

        if (segment.operatingCarrier) {
          detail.OperatingCarrier = {
            AirlineID:    { value: segment.operatingCarrier.code },
            FlightNumber: { value: segment.operatingCarrier.flightNumber },
          };
        }

        return detail;
      }),
    };
  }

  /** @private */
  static _createServiceChange(change) {
    return {
      ChangeType: 'ADD_SERVICE',
      Service: {
        ServiceID:      { value: change.serviceCode },
        PassengerRefs:  (change.passengerReferences ?? []).map(ref => ({ value: ref })),
      },
    };
  }

  /** @private */
  static _createPassengerChange(change) {
    return {
      ChangeType:         'PASSENGER_INFO',
      PassengerReference: { value: change.passengerReference },
      Updates: (change.updates ?? []).map(update => ({
        Field: update.field,
        Value: { value: update.value },
      })),
    };
  }

  /** @private */
  static _createSeatChange(change) {
    return {
      ChangeType: 'SEAT_CHANGE',
      SeatAssignment: {
        SegmentRef:  { value: change.segmentReference },
        PassengerRef: { value: change.passengerReference },
        SeatNumber:   change.seatNumber,
      },
    };
  }

  /** @private */
  static _createPassengers(passengers) {
    if (!passengers.length) return [];

    return {
      Passenger: passengers.map(passenger => {
        const p = {
          ObjectKey: passenger.reference,
          PTC:       { value: passenger.type },
        };

        if (passenger.document) {
          p.PassengerIDInfo = {
            PassengerDocument: [{
              Type:              passenger.document.type,
              ID:                passenger.document.number,
              CountryOfIssuance: passenger.document.issuingCountry,
              DateOfExpiration:  passenger.document.expiryDate,
            }],
          };
        }

        return p;
      }),
    };
  }

  /** @private */
  static _createPayments(payments) {
    if (!payments.length) return [];

    return {
      Payment: payments.map(payment => {
        const p = {
          Amount: {
            value: payment.amount,
            Code:  payment.currency,
          },
        };

        if (payment.card) {
          p.Method = {
            PaymentCard: {
              CardNumber:          { value: payment.card.number },
              SeriesCode:          { value: payment.card.securityCode },
              CardHolderName:      { value: payment.card.holderName },
              EffectiveExpireDate: { value: payment.card.expiryDate },
              CardCode:            payment.card.brand ?? 'VI',
            },
          };
        }

        return p;
      }),
    };
  }
}

export default OrderChange;
