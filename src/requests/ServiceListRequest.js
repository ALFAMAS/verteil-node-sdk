/**
 * @fileoverview Request class for the Verteil ServiceList endpoint.
 *
 * Supports both `pre` (pre-booking ancillary services) and `post` (post-booking
 * ancillary services) request types, mapping to:
 *   `/entrygate/rest/request:preServiceList`
 *   `/entrygate/rest/request:postServiceList`
 */



import BaseRequest from './BaseRequest.js';

const VALID_TYPES    = ['pre', 'post'];
const VALID_PTC      = ['ADT', 'CHD', 'INF'];
const VALID_CHANNELS = ['NDC', 'Direct_Connect'];
const AIRLINE_RE     = /^[A-Z]{2}$/;
const DATE_RE        = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @class ServiceListRequest
 * @extends BaseRequest
 */
class ServiceListRequest extends BaseRequest {
  /**
   * @param {string}      type                 `'pre'` or `'post'`.
   * @param {Object}      query                OriginDestination+Offers (pre) or OrderID (post).
   * @param {Object|null} [travelers]          Traveler definitions.
   * @param {Object|null} [shoppingResponseId] ResponseID from prior AirShopping response.
   * @param {Object|null} [party]              Corporate sender information.
   * @param {Object|null} [qualifier]          ProgramQualifiers for promotions.
   * @param {string|null} [thirdPartyId]
   * @param {string|null} [officeId]
   */
  constructor(
    type,
    query,
    travelers        = null,
    shoppingResponseId = null,
    party            = null,
    qualifier        = null,
    thirdPartyId     = null,
    officeId         = null,
  ) {
    super({ third_party_id: thirdPartyId, office_id: officeId });
    this._type               = type.toLowerCase();
    this._query              = query;
    this._travelers          = travelers;
    this._shoppingResponseId = shoppingResponseId;
    this._party              = party;
    this._qualifier          = qualifier;
  }

  /** @returns {string} */
  getEndpoint() { return `/entrygate/rest/request:${this._type}ServiceList`; }

  /** @returns {Object} */
  getHeaders() {
    return {
      service:      'ServiceList',
      ThirdpartyId: this.data.third_party_id ?? null,
      OfficeId:     this.data.office_id      ?? null,
    };
  }

  /** @throws {Error} */
  validate() {
    this._validateType();
    this._validateQuery();
    if (this._type === 'pre') this._validatePreRequest();
    if (this._party)          this._validateParty();
    if (this._qualifier)      this._validateQualifier();
  }

  /** @returns {Object} */
  toArray() {
    if (this._type === 'post') {
      return { Query: { OrderID: this._query.OrderID } };
    }

    const data = { Query: this._query };
    if (this._travelers)          data.Travelers          = this._travelers;
    if (this._shoppingResponseId) data.ShoppingResponseID = this._shoppingResponseId;
    if (this._party)              data.Party              = this._party;
    if (this._qualifier)          data.Qualifier          = this._qualifier;
    return data;
  }

  // ── Private validators ────────────────────────────────────────────────────

  /** @private */
  _validateType() {
    if (!VALID_TYPES.includes(this._type)) {
      throw new Error('Invalid service list type. Must be pre or post');
    }
  }

  /** @private */
  _validateQuery() {
    if (this._type === 'post') {
      if (!this._query?.OrderID?.Owner || !this._query?.OrderID?.value) {
        throw new Error('OrderID with Owner and value is required for post service list');
      }
      if (!AIRLINE_RE.test(this._query.OrderID.Owner)) {
        throw new Error('Invalid airline code format in OrderID Owner');
      }
      return;
    }

    if (!this._query.OriginDestination || !this._query.Offers) {
      throw new Error('OriginDestination and Offers are required in Query for pre service list');
    }
    this._validateOriginDestination();
    this._validateOffers();
  }

  /** @private */
  _validateOriginDestination() {
    for (const od of this._query.OriginDestination) {
      if (!od.Flight) throw new Error('Flight is required in OriginDestination');
      for (const flight of od.Flight) {
        if (!flight.SegmentKey || !flight.Departure || !flight.Arrival) {
          throw new Error('Invalid Flight structure');
        }
        if (!flight.Departure?.AirportCode?.value || !flight.Arrival?.AirportCode?.value) {
          throw new Error('Airport codes are required for Departure and Arrival');
        }
        if (!flight.Departure.Date) throw new Error('Departure date is required');
      }
    }
  }

  /** @private */
  _validateOffers() {
    if (!this._query.Offers?.Offer) throw new Error('At least one Offer is required');
    for (const offer of this._query.Offers.Offer) {
      if (!offer.OfferID || !offer.OfferItemIDs) {
        throw new Error('Invalid Offer structure. OfferID and OfferItemIDs are required');
      }
      this._validateOfferId(offer.OfferID);
    }
  }

  /** @private */
  _validateOfferId(offerId) {
    if (!offerId.Owner || !offerId.value) {
      throw new Error('OfferID must contain Owner and value');
    }
    if (offerId.Channel && !VALID_CHANNELS.includes(offerId.Channel)) {
      throw new Error('Invalid channel in OfferID');
    }
  }

  /** @private */
  _validatePreRequest() {
    if (this._travelers) this._validateTravelers();
    if (this._shoppingResponseId) this._validateShoppingResponseId();
  }

  /** @private */
  _validateTravelers() {
    if (!this._travelers?.Traveler) throw new Error('At least one Traveler is required');
    for (const traveler of this._travelers.Traveler) {
      if (traveler.AnonymousTraveler) {
        this._validateAnonymousTraveler(traveler.AnonymousTraveler);
      } else if (traveler.RecognizedTraveler) {
        this._validateRecognizedTraveler(traveler.RecognizedTraveler);
      } else {
        throw new Error('Invalid Traveler structure');
      }
    }
  }

  /** @private */
  _validateAnonymousTraveler(anonList) {
    for (const anon of anonList) {
      if (!anon.PTC?.value) throw new Error('PTC is required for anonymous travelers');
      if (!VALID_PTC.includes(anon.PTC.value)) {
        throw new Error('Invalid PTC value. Must be ADT, CHD, or INF');
      }
      if (anon.Age) this._validateAge(anon.Age);
    }
  }

  /** @private */
  _validateRecognizedTraveler(rt) {
    for (const f of ['ObjectKey', 'PTC', 'Name']) {
      if (!rt[f]) throw new Error(`${f} is required for recognized travelers`);
    }
    if (rt.FQTVs) {
      for (const fqtv of rt.FQTVs) {
        if (!fqtv.AirlineID || !fqtv.Account) {
          throw new Error('Invalid FQTV structure');
        }
      }
    }
  }

  /** @private */
  _validateAge(age) {
    if (age.Value && (age.Value.value == null || isNaN(age.Value.value))) {
      throw new Error('Invalid age value');
    }
    if (age.BirthDate && !DATE_RE.test(age.BirthDate.value)) {
      throw new Error('Invalid birth date format. Must be YYYY-MM-DD');
    }
  }

  /** @private */
  _validateShoppingResponseId() {
    if (!this._shoppingResponseId?.ResponseID?.value) {
      throw new Error('Invalid ShoppingResponseID structure');
    }
  }

  /** @private */
  _validateParty() {
    if (!this._party?.Sender?.CorporateSender) {
      throw new Error('Invalid Party structure');
    }
    if (!this._party.Sender.CorporateSender.CorporateCode) {
      throw new Error('CorporateCode is required in CorporateSender');
    }
  }

  /** @private */
  _validateQualifier() {
    if (this._qualifier.ProgramQualifiers) {
      if (!this._qualifier.ProgramQualifiers.ProgramQualifier) {
        throw new Error('Invalid ProgramQualifiers structure');
      }
      for (const q of this._qualifier.ProgramQualifiers.ProgramQualifier) {
        if (!q.DiscountProgramQualifier) {
          throw new Error('DiscountProgramQualifier is required');
        }
        for (const f of ['Account', 'AssocCode', 'Name']) {
          if (!q.DiscountProgramQualifier[f]?.value) {
            throw new Error(`${f} is required in DiscountProgramQualifier`);
          }
        }
      }
    }
  }
}

export default ServiceListRequest;
