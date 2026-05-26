/**
 * @fileoverview Request class for the Verteil SeatAvailability endpoint.
 *
 * Supports both `pre` (pre-booking seat map) and `post` (post-booking seat map)
 * request types, mapping to:
 *   `/entrygate/rest/request:preSeatAvailability`
 *   `/entrygate/rest/request:postSeatAvailability`
 */



import BaseRequest from './BaseRequest.js';

const VALID_TYPES = ['pre', 'post'];
const VALID_PTC   = ['ADT', 'CHD', 'INF'];

/**
 * @class SeatAvailabilityRequest
 * @extends BaseRequest
 */
class SeatAvailabilityRequest extends BaseRequest {
  /**
   * @param {string}      type               `'pre'` or `'post'`.
   * @param {Object}      query              OriginDestination+Offers (pre) or OrderID (post).
   * @param {Object|null} [dataLists]        FareList / FlightSegmentList for pre.
   * @param {Object|null} [travelers]        Traveler definitions for pre.
   * @param {Object|null} [shoppingResponseId] From prior AirShopping response.
   * @param {string|null} [thirdPartyId]
   * @param {string|null} [officeId]
   */
  constructor(
    type,
    query,
    dataLists        = null,
    travelers        = null,
    shoppingResponseId = null,
    thirdPartyId     = null,
    officeId         = null,
  ) {
    super({ third_party_id: thirdPartyId, office_id: officeId });
    this._type               = type.toLowerCase();
    this._query              = query;
    this._dataLists          = dataLists;
    this._travelers          = travelers;
    this._shoppingResponseId = shoppingResponseId;
  }

  /** @returns {string} */
  getEndpoint() { return `/entrygate/rest/request:${this._type}SeatAvailability`; }

  /** @returns {Object} */
  getHeaders() {
    return {
      service:      'SeatAvailability',
      ThirdpartyId: this.data.third_party_id ?? null,
      OfficeId:     this.data.office_id      ?? null,
    };
  }

  /** @throws {Error} */
  validate() {
    if (!VALID_TYPES.includes(this._type)) {
      throw new Error(`Invalid seat availability type: ${this._type}`);
    }
    this._validateQuery();
    if (this._type === 'pre') this._validatePreRequest();
  }

  /** @returns {Object} */
  toArray() {
    if (this._type === 'post') {
      return { Query: { OrderID: this._query.OrderID } };
    }

    const data = { Query: this._query };
    if (this._dataLists)          data.DataLists          = this._dataLists;
    if (this._travelers)          data.Travelers          = this._travelers;
    if (this._shoppingResponseId) data.ShoppingResponseID = this._shoppingResponseId;
    return data;
  }

  // ── Private validators ────────────────────────────────────────────────────

  /** @private */
  _validateQuery() {
    if (this._type === 'post') {
      if (!this._query?.OrderID?.Owner || !this._query?.OrderID?.value) {
        throw new Error('OrderID with Owner and value is required for post seat availability');
      }
      return;
    }
    if (!this._query.OriginDestination || !this._query.Offers) {
      throw new Error('OriginDestination and Offers are required for pre seat availability');
    }
    if (!this._query.Offers?.Offer?.length) throw new Error('At least one Offer is required');
    for (const offer of this._query.Offers.Offer) {
      if (!offer.OfferID || !offer.OfferItemIDs) {
        throw new Error('Invalid Offer structure: OfferID and OfferItemIDs are required');
      }
    }
  }

  /** @private */
  _validatePreRequest() {
    if (this._travelers?.Traveler) {
      for (const traveler of this._travelers.Traveler) {
        if (traveler.AnonymousTraveler) {
          for (const anon of traveler.AnonymousTraveler) {
            if (!VALID_PTC.includes(anon.PTC?.value)) {
              throw new Error(`Invalid PTC value: ${anon.PTC?.value}`);
            }
          }
        }
      }
    }
    if (this._shoppingResponseId && !this._shoppingResponseId?.ResponseID?.value) {
      throw new Error('Invalid ShoppingResponseID structure');
    }
  }
}

export default SeatAvailabilityRequest;
