/**
 * @fileoverview Request class for the Verteil AirShopping endpoint.
 *
 * Validates caller-supplied search parameters and serialises them into the
 * NDC-compliant JSON payload expected by `/entrygate/rest/request:airShopping`.
 */



import BaseRequest from './BaseRequest.js';

const VALID_PASSENGER_TYPES = ['ADT', 'CHD', 'INF'];
const VALID_CABIN_CODES      = ['Y', 'W', 'C', 'F'];
const VALID_FARE_TYPES       = ['PUBL','FLEX','PVT','IT','CB','STU','MR','HR','VFR','LBR','CRU'];
const VALID_SORT_ORDERS      = ['ASCENDING', 'DESCENDING'];
const VALID_SORT_PARAMS      = ['STOP', 'PRICE', 'DEPARTURE_TIME'];
const VALID_SHOP_PREFS       = ['OPTIMIZED', 'FULL', 'BEST'];

/**
 * Constructs and validates an AirShopping request.
 *
 * @class AirShoppingRequest
 * @extends BaseRequest
 *
 * @example
 * const req = new AirShoppingRequest({
 *   coreQuery: {
 *     originDestinations: [{
 *       departureAirport: 'LHR', arrivalAirport: 'JFK',
 *       departureDate: '2025-09-01', key: 'OD1'
 *     }]
 *   },
 *   travelers: [{ passengerType: 'ADT' }],
 *   thirdPartyId: 'LH',
 * });
 */
class AirShoppingRequest extends BaseRequest {
  /**
   * @param {Object}      data              Validated parameter map.
   * @param {Object}      data.coreQuery
   * @param {Array}       data.travelers
   * @param {Object}      [data.preference]
   * @param {Object}      [data.responseParameters]
   * @param {string|null} [data.thirdPartyId]
   * @param {string|null} [data.officeId]
   */
  constructor(data) {
    super(data);
    /** @private @type {string|null} */
    this._thirdPartyId = data.thirdPartyId ?? null;
    /** @private @type {string|null} */
    this._officeId     = data.officeId ?? null;
  }

  /** @returns {string} */
  getEndpoint() {
    return '/entrygate/rest/request:airShopping';
  }

  /** @returns {Object} */
  getHeaders() {
    const headers = { service: 'AirShopping' };
    if (this._thirdPartyId) headers.ThirdpartyId = this._thirdPartyId;
    if (this._officeId)     headers.OfficeId     = this._officeId;
    return headers;
  }

  /**
   * Validates the request parameters.
   *
   * @throws {Error} On any validation failure.
   * @returns {void}
   */
  validate() {
    this._validateCoreQuery();
    this._validateTravelers();
    if (this.data.preference)         this._validatePreference();
    if (this.data.responseParameters) this._validateResponseParameters();
  }

  /** @returns {Object} NDC-compliant JSON payload. */
  toArray() {
    return {
      CoreQuery: {
        OriginDestinations: {
          OriginDestination: (this.data.coreQuery?.originDestinations ?? []).map(od => ({
            Departure: {
              AirportCode: { value: od.departureAirport },
              Date:        od.departureDate,
            },
            Arrival: {
              AirportCode: { value: od.arrivalAirport },
            },
            OriginDestinationKey: od.key,
          })),
        },
      },
      Travelers: {
        Traveler: (this.data.travelers ?? []).map(traveler => {
          if (traveler.frequentFlyer) {
            return {
              RecognizedTraveler: {
                FQTVs: [{
                  AirlineID: { value: traveler.frequentFlyer.airlineCode },
                  Account: {
                    Number: { value: traveler.frequentFlyer.accountNumber },
                  },
                }],
                ObjectKey: traveler.objectKey,
                PTC:       { value: traveler.passengerType },
                Name: {
                  Given:   (traveler.name?.given ?? []).map(g => ({ value: g })),
                  Surname: { value: traveler.name?.surname },
                  Title:   traveler.name?.title,
                },
              },
            };
          }

          const anonymous = { PTC: { value: traveler.passengerType } };
          if (traveler.age != null) {
            anonymous.Age = { Value: { value: traveler.age.value } };
          }
          return { AnonymousTraveler: [anonymous] };
        }),
      },
      Preference: {
        CabinPreferences: this.data.preference?.cabin
          ? { CabinType: [{ Code: this.data.preference.cabin }] }
          : null,
        FarePreferences: {
          Types: {
            Type: (this.data.preference?.fareTypes ?? ['PUBL']).map(t => ({ Code: t })),
          },
        },
      },
      ResponseParameters: this.data.responseParameters ?? {
        SortOrder:           [{ Order: 'ASCENDING', Parameter: 'PRICE' }],
        ShopResultPreference: 'OPTIMIZED',
      },
      EnableGDS: this.data.enableGDS ?? null,
    };
  }

  // ── Private validators ────────────────────────────────────────────────────

  /** @private */
  _validateCoreQuery() {
    const ods = this.data.coreQuery?.originDestinations;
    if (!Array.isArray(ods) || ods.length === 0) {
      throw new Error('originDestinations is required in coreQuery');
    }
    for (const od of ods) {
      if (!od.departureAirport || !od.arrivalAirport || !od.departureDate || !od.key) {
        throw new Error('Invalid originDestination: required fields are departureAirport, arrivalAirport, departureDate, key');
      }
    }
  }

  /** @private */
  _validateTravelers() {
    const travelers = this.data.travelers;
    if (!Array.isArray(travelers) || travelers.length === 0) {
      throw new Error('At least one traveler is required');
    }
    for (const t of travelers) {
      if (!t.passengerType) throw new Error('passengerType is required for each traveler');
      if (!VALID_PASSENGER_TYPES.includes(t.passengerType)) {
        throw new Error(`Invalid passengerType: ${t.passengerType}. Must be one of ${VALID_PASSENGER_TYPES.join(', ')}`);
      }
    }
  }

  /** @private */
  _validatePreference() {
    const pref = this.data.preference;
    if (pref.cabin && !VALID_CABIN_CODES.includes(pref.cabin)) {
      throw new Error(`Invalid cabin code: ${pref.cabin}. Must be one of ${VALID_CABIN_CODES.join(', ')}`);
    }
    if (pref.fareTypes) {
      for (const ft of pref.fareTypes) {
        if (!VALID_FARE_TYPES.includes(ft)) {
          throw new Error(`Invalid fare type: ${ft}`);
        }
      }
    }
  }

  /** @private */
  _validateResponseParameters() {
    const rp = this.data.responseParameters;
    if (rp.SortOrder) {
      for (const sort of rp.SortOrder) {
        if (!VALID_SORT_ORDERS.includes(sort.Order)) {
          throw new Error(`Invalid sort order: ${sort.Order}`);
        }
        if (!VALID_SORT_PARAMS.includes(sort.Parameter)) {
          throw new Error(`Invalid sort parameter: ${sort.Parameter}`);
        }
      }
    }
    if (rp.ShopResultPreference && !VALID_SHOP_PREFS.includes(rp.ShopResultPreference)) {
      throw new Error(`Invalid ShopResultPreference: ${rp.ShopResultPreference}`);
    }
  }
}

export default AirShoppingRequest;
