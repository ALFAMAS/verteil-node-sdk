/**
 * @fileoverview Request class for the Verteil FlightPrice endpoint.
 *
 * Validates and serialises flight-pricing parameters for
 * `/entrygate/rest/request:flightPrice`.
 * The heavy serialisation work is delegated to {@link FlightPrice.create}.
 */



import BaseRequest from './BaseRequest.js';
import FlightPrice from '../dataTypes/FlightPrice.js';

const VALID_PTC      = ['ADT', 'CHD', 'INF'];
const VALID_BRANDS   = ['AX', 'DS', 'DC', 'UP', 'JC', 'CA', 'TP', 'VI'];
const AIRLINE_RE     = /^[A-Z]{2}$/;
const FLIGHT_NUM_RE  = /^\d{1,4}[A-Z]?$/;
const CURRENCY_RE    = /^[A-Z]{3}$/;

/**
 * Constructs and validates a FlightPrice request.
 *
 * @class FlightPriceRequest
 * @extends BaseRequest
 */
class FlightPriceRequest extends BaseRequest {
  /**
   * @param {Object}      dataLists         Fare and traveler data-lists.
   * @param {Object}      query             Origin-destination / offer selection.
   * @param {Array}       travelers         Traveler references.
   * @param {Object}      shoppingResponseId  { owner, responseId }
   * @param {Object|null} [party]           Corporate party information.
   * @param {Object|null} [parameters]      Override-currency parameters.
   * @param {Object|null} [qualifier]       Promo / payment-card qualifiers.
   * @param {Object|null} [metadata]        Augmentation metadata.
   * @param {string|null} [thirdPartyId]    Overrides `shoppingResponseId.owner`.
   * @param {string|null} [officeId]        Office identifier header value.
   */
  constructor(
    dataLists,
    query,
    travelers,
    shoppingResponseId,
    party      = null,
    parameters = null,
    qualifier  = null,
    metadata   = null,
    thirdPartyId = null,
    officeId   = null,
  ) {
    super({});
    this._dataLists         = dataLists;
    this._query             = query;
    this._travelers         = travelers;
    this._shoppingResponseId = shoppingResponseId;
    this._party             = party;
    this._parameters        = parameters;
    this._qualifier         = qualifier;
    this._metadata          = metadata;
    this._thirdPartyId      = thirdPartyId ?? shoppingResponseId?.owner ?? null;
    this._officeId          = officeId;
  }

  /** @returns {string} */
  getEndpoint() { return '/entrygate/rest/request:flightPrice'; }

  /** @returns {Object} */
  getHeaders() {
    const h = { service: 'FlightPrice' };
    if (this._thirdPartyId) h.ThirdpartyId = this._thirdPartyId;
    if (this._officeId)     h.OfficeId     = this._officeId;
    return h;
  }

  /**
   * Validates all required sections.
   * @throws {Error}
   */
  validate() {
    this._validateDataLists();
    this._validateQuery();
    this._validateTravelers();
    this._validateShoppingResponseId();
    if (this._party)      this._validateParty();
    if (this._parameters) this._validateParameters();
    if (this._qualifier)  this._validateQualifier();
  }

  /** @returns {Object} */
  toArray() {
    return FlightPrice.create({
      dataLists:         this._dataLists,
      query:             this._query,
      travelers:         this._travelers,
      shoppingResponseId: this._shoppingResponseId,
      party:             this._party,
      parameters:        this._parameters,
      qualifier:         this._qualifier,
      metadata:          this._metadata,
    });
  }

  // ── Private validators ────────────────────────────────────────────────────

  /** @private */
  _validateDataLists() {
    if (!this._dataLists.fares) throw new Error('Fares are required in DataLists');
    for (const fare of this._dataLists.fares) {
      if (!fare.listKey || !fare.code) throw new Error('Each fare must contain listKey and code');
    }
    for (const t of this._dataLists.anonymousTravelers ?? []) {
      if (!t.objectKey)       throw new Error('Anonymous traveler must have objectKey');
      if (!t.passengerType || !VALID_PTC.includes(t.passengerType)) {
        throw new Error(`Invalid PTC in anonymousTravelers: ${t.passengerType}`);
      }
    }
    for (const t of this._dataLists.recognizedTravelers ?? []) {
      if (!t.objectKey)       throw new Error('Recognized traveler must have objectKey');
      if (!t.passengerType || !VALID_PTC.includes(t.passengerType)) {
        throw new Error(`Invalid PTC in recognizedTravelers: ${t.passengerType}`);
      }
      for (const fqtv of t.frequentFlyer ?? []) {
        if (!fqtv.airlineCode || !fqtv.accountNumber) {
          throw new Error('frequentFlyer entry must have airlineCode and accountNumber');
        }
      }
    }
  }

  /** @private */
  _validateQuery() {
    if (!this._query.originDestinations) throw new Error('OriginDestinations are required in Query');
    for (const od of this._query.originDestinations) {
      if (!od.flights) throw new Error('Flights are required in each OriginDestination');
      od.flights.forEach(f => this._validateFlight(f));
    }
    if (!this._query.offers) throw new Error('Offers are required in Query');
    this._query.offers.forEach(o => this._validateOffer(o));
  }

  /** @private */
  _validateFlight(flight) {
    for (const f of ['segmentKey', 'departure', 'arrival', 'airlineCode', 'flightNumber']) {
      if (!flight[f]) throw new Error(`Missing required flight field: ${f}`);
    }
    if (!AIRLINE_RE.test(flight.airlineCode)) throw new Error('Invalid airline code format');
    if (!FLIGHT_NUM_RE.test(flight.flightNumber)) throw new Error('Invalid flight number format');
    if (!flight.departure.airportCode || !flight.departure.date) {
      throw new Error('Departure must contain airportCode and date');
    }
    if (!flight.arrival.airportCode) {
      throw new Error('Arrival must contain airportCode');
    }
  }

  /** @private */
  _validateOffer(offer) {
    if (!offer.owner || !offer.offerId || !offer.offerItems) {
      throw new Error('Each offer must contain owner, offerId, and offerItems');
    }
    for (const item of offer.offerItems) {
      if (!item.id) throw new Error('Each offer item must contain an id');
      for (const seat of item.selectedSeats ?? []) {
        if (!seat.segmentRefs || !seat.travelerRef || !seat.column || !seat.row) {
          throw new Error('selectedSeat must contain segmentRefs, travelerRef, column, and row');
        }
      }
    }
  }

  /** @private */
  _validateTravelers() {
    if (!Array.isArray(this._travelers) || !this._travelers.length) {
      throw new Error('At least one traveler is required');
    }
    for (const t of this._travelers) {
      if (!t.passengerType || !VALID_PTC.includes(t.passengerType)) {
        throw new Error(`Invalid passenger type: ${t.passengerType}`);
      }
      if (t.frequentFlyer) {
        const ff = t.frequentFlyer;
        if (!ff.airlineCode || !ff.accountNumber) {
          throw new Error('frequentFlyer must contain airlineCode and accountNumber');
        }
      }
    }
  }

  /** @private */
  _validateShoppingResponseId() {
    if (!this._shoppingResponseId?.owner || !this._shoppingResponseId?.responseId) {
      throw new Error('ShoppingResponseID must contain owner and responseId');
    }
    if (!AIRLINE_RE.test(this._shoppingResponseId.owner)) {
      throw new Error('Invalid airline code in ShoppingResponseID owner');
    }
  }

  /** @private */
  _validateParty() {
    if (!this._party.corporateCode) throw new Error('Corporate code is required in Party');
    if (!/^[A-Z]{2}(\/[A-Z0-9]+)?(\/[A-Z0-9]+)?$/.test(this._party.corporateCode)) {
      throw new Error('Invalid corporate code format');
    }
  }

  /** @private */
  _validateParameters() {
    if (this._parameters.currency && !CURRENCY_RE.test(this._parameters.currency)) {
      throw new Error('Invalid currency code format');
    }
  }

  /** @private */
  _validateQualifier() {
    for (const pq of this._qualifier.programQualifiers ?? []) {
      if (!pq.promoCode || !pq.airlineCode) {
        throw new Error('Each programQualifier must contain promoCode and airlineCode');
      }
    }
    if (this._qualifier.paymentCard) {
      const { brandCode, number, productType } = this._qualifier.paymentCard;
      if (!brandCode || !number) throw new Error('Payment card must contain brandCode and number');
      if (!VALID_BRANDS.includes(brandCode)) throw new Error('Invalid card brand code');
      if (productType != null && !['P', 'C'].includes(productType)) {
        throw new Error("paymentCard.productType must be 'P' or 'C'");
      }
    }
  }
}

export default FlightPriceRequest;
