/**
 * @fileoverview Transforms raw caller-supplied parameter maps into the
 * positional / structured constructor arguments expected by each concrete
 * request class.
 *
 * Every endpoint that has a request class with positional constructor args
 * (i.e. not just a single `params` object) must have a matching case here.
 * Adding a new endpoint requires a `case` in {@link RequestHelper.transformParameters}
 * and a corresponding private `_transformXxx` method.
 */

import OrderRetrieve from '../dataTypes/OrderRetrieve.js';

/**
 * Static utility that normalises raw parameters before they are forwarded to
 * individual request constructors.
 *
 * @class RequestHelper
 */
class RequestHelper {
  /**
   * Dispatches to the appropriate transformer for the given endpoint.
   *
   * @param {string} endpoint  Verteil endpoint name (camelCase).
   * @param {Object} params    Raw parameters from the caller.
   * @returns {Array}          Spread-ready constructor arguments.
   */
  static transformParameters(endpoint, params) {
    switch (endpoint) {
      case 'airShopping':      return [params];
      case 'flightPrice':      return RequestHelper._transformFlightPriceParams(params);
      case 'orderCreate':      return RequestHelper._transformOrderCreateParams(params);
      case 'orderRetrieve':    return RequestHelper._transformOrderRetrieveParams(params);
      case 'orderCancel':      return RequestHelper._transformOrderCancelParams(params);
      case 'orderChange':      return RequestHelper._transformOrderChangeParams(params);
      case 'orderReshop':      return RequestHelper._transformOrderReshopParams(params);
      case 'itinReshop':       return RequestHelper._transformItinReshopParams(params);
      case 'orderChangeNotif': return RequestHelper._transformOrderChangeNotifParams(params);
      case 'seatAvailability': return RequestHelper._transformSeatAvailabilityParams(params);
      case 'serviceList':      return RequestHelper._transformServiceListParams(params);
      default:                 return [params];
    }
  }

  // ── Private transformers ──────────────────────────────────────────────────

  /**
   * Transforms parameters for the FlightPrice request constructor.
   *
   * @private
   * @param {Object} params
   * @returns {Array}
   */
  static _transformFlightPriceParams(params) {
    return [
      params.dataLists          ?? {},
      params.query              ?? {},
      params.travelers          ?? [],
      params.shoppingResponseId ?? {},
      params.party              ?? null,
      params.parameters         ?? null,
      params.qualifier          ?? null,
      params.metadata           ?? null,
      params.third_party_id     ?? null,
      params.office_id          ?? null,
    ];
  }

  /**
   * Transforms parameters for the OrderCreate request constructor.
   *
   * @private
   * @param {Object} params
   * @returns {Array}
   */
  static _transformOrderCreateParams(params) {
    return [
      params.query          ?? {},
      params.party          ?? null,
      params.payments       ?? null,
      params.commission     ?? null,
      params.metadata       ?? null,
      params.third_party_id ?? null,
      params.office_id      ?? null,
    ];
  }

  /**
   * Builds the NDC Query.Filters structure for OrderRetrieve.
   * Caller supplies `{ owner, orderId, channel?, refs? }`.
   *
   * @private
   * @param {Object} params
   * @returns {Array}
   */
  static _transformOrderRetrieveParams(params) {
    return [OrderRetrieve.create(params)];
  }

  /**
   * Transforms parameters for the OrderCancel request constructor.
   * Caller supplies `{ orders: [{owner, orderId, channel?, refs?}], expectedRefundAmount?,
   * metadata?, correlationId?, third_party_id?, office_id? }`.
   *
   * @private
   * @param {Object} params
   * @returns {Array}
   */
  static _transformOrderCancelParams(params) {
    const orders = (params.orders ?? []).map(o => {
      const id = { Owner: o.owner, value: o.orderId };
      if (o.channel) id.Channel = o.channel;
      if (Array.isArray(o.refs) && o.refs.length) {
        id.refs = o.refs.map(r => ({ Ref: { value: r } }));
      }
      return id;
    });

    const refund = params.expectedRefundAmount
      ? { Total: { value: params.expectedRefundAmount.amount, Code: params.expectedRefundAmount.currency } }
      : null;

    return [
      orders,
      refund,
      params.metadata      ?? null,
      params.correlationId ?? null,
      params.third_party_id ?? null,
      params.office_id      ?? null,
    ];
  }

  /**
   * Transforms parameters for the OrderChange request constructor.
   * Caller supplies `{ orderId: {owner, orderId, channel?}, changes, passengers?,
   * payments?, correlationId?, third_party_id?, office_id? }`.
   *
   * @private
   * @param {Object} params
   * @returns {Array}
   */
  static _transformOrderChangeParams(params) {
    const oid = params.orderId ?? {};
    return [
      {
        Owner:   oid.owner,
        value:   oid.orderId ?? oid.value,
        Channel: oid.channel ?? 'NDC',
      },
      params.changes       ?? [],
      params.passengers    ?? null,
      params.payments      ?? null,
      params.correlationId ?? null,
      params.third_party_id ?? null,
      params.office_id      ?? null,
    ];
  }

  /**
   * Transforms parameters for the OrderReshop request constructor.
   * Caller supplies `{ orderId: {owner, orderId, channel?}, qualifiers?,
   * segments?, passengerRefs?, searchAlternateDates?, third_party_id?, office_id? }`.
   *
   * @private
   * @param {Object} params
   * @returns {Array}
   */
  static _transformOrderReshopParams(params) {
    const oid = params.orderId ?? {};
    return [
      {
        Owner:   oid.owner,
        value:   oid.orderId ?? oid.value,
        Channel: oid.channel ?? 'NDC',
      },
      params.qualifiers           ?? null,
      params.segments             ?? null,
      params.passengerRefs        ?? null,
      params.searchAlternateDates ?? null,
      params.third_party_id       ?? null,
      params.office_id            ?? null,
    ];
  }

  /**
   * Transforms parameters for the ItinReshop request constructor.
   * Caller supplies `{ orderId: {owner, value, channel?}, itineraryChanges,
   * pricingQualifiers?, party?, metadata?, third_party_id?, office_id? }`.
   *
   * @private
   * @param {Object} params
   * @returns {Array}
   */
  static _transformItinReshopParams(params) {
    const oid = params.orderId ?? {};
    return [
      {
        Owner:   oid.owner,
        value:   oid.value,
        Channel: oid.channel ?? 'NDC',
      },
      params.itineraryChanges  ?? [],
      params.pricingQualifiers ?? null,
      params.party             ?? null,
      params.metadata          ?? null,
      params.third_party_id    ?? null,
      params.office_id         ?? null,
    ];
  }

  /**
   * Transforms parameters for the OrderChangeNotif request constructor.
   * Caller supplies `{ orderId: {owner, value, channel?}, notification,
   * serviceImpact?, alternatives?, third_party_id?, office_id? }`.
   *
   * @private
   * @param {Object} params
   * @returns {Array}
   */
  static _transformOrderChangeNotifParams(params) {
    const oid = params.orderId ?? {};
    return [
      {
        Owner:   oid.owner,
        value:   oid.value,
        Channel: oid.channel ?? 'NDC',
      },
      params.notification   ?? {},
      params.serviceImpact  ?? null,
      params.alternatives   ?? null,
      params.third_party_id ?? null,
      params.office_id      ?? null,
    ];
  }

  /**
   * Transforms parameters for the SeatAvailability request constructor.
   * Caller supplies `{ type: 'pre'|'post', query, dataLists?, travelers?,
   * shoppingResponseId?, third_party_id?, office_id? }`.
   *
   * @private
   * @param {Object} params
   * @returns {Array}
   */
  static _transformSeatAvailabilityParams(params) {
    return [
      params.type               ?? 'pre',
      params.query              ?? {},
      params.dataLists          ?? null,
      params.travelers          ?? null,
      params.shoppingResponseId ?? null,
      params.third_party_id     ?? null,
      params.office_id          ?? null,
    ];
  }

  /**
   * Transforms parameters for the ServiceList request constructor.
   * Caller supplies `{ type: 'pre'|'post', query, travelers?, shoppingResponseId?,
   * party?, qualifier?, third_party_id?, office_id? }`.
   *
   * @private
   * @param {Object} params
   * @returns {Array}
   */
  static _transformServiceListParams(params) {
    return [
      params.type               ?? 'pre',
      params.query              ?? {},
      params.travelers          ?? null,
      params.shoppingResponseId ?? null,
      params.party              ?? null,
      params.qualifier          ?? null,
      params.third_party_id     ?? null,
      params.office_id          ?? null,
    ];
  }
}

export default RequestHelper;
