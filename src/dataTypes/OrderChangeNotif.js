/**
 * @fileoverview DataType builder for the Verteil OrderChangeNotif endpoint.
 *
 * Constructs the NDC notification payload for schedule changes, flight
 * cancellations, route changes, and aircraft changes — including affected
 * segments, service impacts, and re-accommodation alternatives.
 */

/**
 * @class OrderChangeNotif
 * @description Static factory for building OrderChangeNotif request bodies.
 */
class OrderChangeNotif {
  /**
   * Builds the top-level OrderChangeNotif request object.
   *
   * @param {Object} [params={}]
   * @param {{owner:string, value:string, channel?:string}} params.orderId
   *   Target order identifier.
   * @param {Object}   params.notification    - Notification details (type, reason, severity).
   * @param {Array}    [params.serviceImpact] - Impacted services.
   * @param {Array}    [params.alternatives]  - Re-accommodation alternatives.
   * @param {Array}    [params.metadata]      - Optional metadata entries.
   * @returns {Object} OrderChangeNotif NDC request body.
   */
  static create(params = {}) {
    return {
      Query:    OrderChangeNotif._createQuery(params),
      Metadata: OrderChangeNotif._createMetadata(params.metadata ?? []),
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
      Notification: OrderChangeNotif._createNotification(params.notification ?? {}),
    };

    if (params.serviceImpact) {
      query.ServiceImpact = OrderChangeNotif._createServiceImpact(params.serviceImpact);
    }

    if (params.alternatives) {
      query.Alternatives = OrderChangeNotif._createAlternatives(params.alternatives);
    }

    return query;
  }

  /** @private */
  static _createNotification(notification) {
    const notif = {
      Type:        notification.type,
      Reason:      notification.reason,
      Severity:    notification.severity  ?? 'INFO',
      Description: notification.description ?? null,
      Timestamp:   notification.timestamp   ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    };

    if (Array.isArray(notification.affectedSegments)) {
      notif.AffectedSegments = notification.affectedSegments.map(segment => ({
        SegmentRef: { value: segment.segmentRef },
        ChangeDetails: {
          Type:        segment.changeType   ?? null,
          Description: segment.description  ?? null,
          OldValue:    segment.oldValue     ?? null,
          NewValue:    segment.newValue     ?? null,
        },
        ImpactIndicators: segment.impacts
          ? OrderChangeNotif._createImpactIndicators(segment.impacts)
          : null,
      }));
    }

    if (notification.customerNotification) {
      notif.CustomerNotification = {
        Required:  notification.customerNotification.required ?? true,
        Method:    notification.customerNotification.method   ?? null,
        Template:  notification.customerNotification.template ?? null,
        Language:  notification.customerNotification.language ?? null,
      };
    }

    return notif;
  }

  /** @private */
  static _createImpactIndicators(impacts) {
    return {
      Duration: impacts.duration ? {
        Change: impacts.duration.change,
        Unit:   impacts.duration.unit ?? 'MIN',
      } : null,
      Connection: impacts.connection ? {
        Affected:    impacts.connection.affected,
        MinimumTime: impacts.connection.minimumTime ?? null,
      } : null,
      Cabin: impacts.cabin ? {
        DowngradeStatus: impacts.cabin.downgradeStatus ?? false,
        NewCabinCode:    impacts.cabin.newCode         ?? null,
      } : null,
    };
  }

  /** @private */
  static _createServiceImpact(serviceImpact) {
    return serviceImpact.map(impact => ({
      ServiceDefinitionID: { value: impact.serviceId },
      ServiceType:         impact.serviceType,
      Status:              impact.status,
      Description:         impact.description ?? null,
      AffectedPassengers:  Array.isArray(impact.passengers)
        ? impact.passengers.map(ref => ({ PassengerReference: ref }))
        : null,
      CompensationDetails: impact.compensation ? {
        Type:   impact.compensation.type,
        Amount: {
          value: impact.compensation.amount,
          Code:  impact.compensation.currency,
        },
        ValidityPeriod: impact.compensation.validity ? {
          Start: impact.compensation.validity.start,
          End:   impact.compensation.validity.end,
        } : null,
      } : null,
    }));
  }

  /** @private */
  static _createAlternatives(alternatives) {
    return alternatives.map(alternative => {
      const alt = {
        Type:        alternative.type,
        Description: alternative.description ?? null,
        ValidityPeriod: alternative.validity ? {
          Start: alternative.validity.start,
          End:   alternative.validity.end,
        } : null,
      };

      if (Array.isArray(alternative.segments)) {
        alt.Segments = alternative.segments.map(segment => {
          const seg = {
            Departure: {
              AirportCode: { value: segment.origin },
              Date:        segment.departure.date,
              Time:        segment.departure.time ?? null,
              Terminal:    segment.departure.terminal
                ? { Name: segment.departure.terminal }
                : null,
            },
            Arrival: {
              AirportCode: { value: segment.destination },
              Date:        segment.arrival.date     ?? null,
              Time:        segment.arrival.time     ?? null,
              Terminal:    segment.arrival.terminal
                ? { Name: segment.arrival.terminal }
                : null,
            },
            MarketingCarrier: {
              AirlineID:    { value: segment.airline },
              FlightNumber: { value: segment.flightNumber },
            },
          };

          if (segment.operatingCarrier) {
            seg.OperatingCarrier = {
              AirlineID:    { value: segment.operatingCarrier.airline },
              FlightNumber: { value: segment.operatingCarrier.flightNumber },
            };
          }

          if (segment.aircraft) {
            seg.Equipment = { AircraftCode: segment.aircraft };
          }

          if (segment.cabin) {
            seg.CabinType = { Code: segment.cabin };
          }

          return seg;
        });
      }

      if (alternative.pricing) {
        alt.PricingDetails = {
          PriceDifference: {
            Amount: {
              value: alternative.pricing.difference,
              Code:  alternative.pricing.currency,
            },
          },
          RefundDetails: alternative.pricing.refund ? {
            Amount: {
              value: alternative.pricing.refund.amount,
              Code:  alternative.pricing.refund.currency,
            },
            Type: alternative.pricing.refund.type ?? 'Full',
          } : null,
        };
      }

      return alt;
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
          Category:    meta.category    ?? null,
        })),
      },
    };
  }
}

export default OrderChangeNotif;
