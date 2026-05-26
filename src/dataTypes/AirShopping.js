/**
 * @fileoverview DataType builder for the Verteil AirShopping endpoint.
 *
 * Provides a simple parameter-normalisation factory that maps caller-supplied
 * keys to the canonical field names expected by AirShoppingRequest.
 */

/**
 * @class AirShopping
 * @description Static factory for building AirShopping request parameter objects.
 */
class AirShopping {
  /**
   * Normalises raw caller params into the shape consumed by AirShoppingRequest.
   *
   * @param {Object} [params={}]
   * @param {Object}   [params.coreQuery]            - Core shopping query (origin/destination, dates).
   * @param {Array}    [params.travelers]             - Traveler type counts.
   * @param {Object}   [params.preference]            - Cabin / fare-type preferences.
   * @param {Object}   [params.responseParameters]    - Response shape controls.
   * @param {boolean|null} [params.enableGDS]         - Whether to include GDS content.
   * @param {Object|null}  [params.qualifier]         - Program / discount qualifiers.
   * @param {string|null}  [params.third_party_id]    - Third-party identifier.
   * @returns {Object} Normalised AirShopping parameter object.
   */
  static create(params = {}) {
    return {
      coreQuery:          params.coreQuery          ?? {},
      travelers:          params.travelers           ?? [],
      preference:         params.preference          ?? {},
      responseParameters: params.responseParameters  ?? {},
      enableGDS:          params.enableGDS           ?? null,
      qualifier:          params.qualifier           ?? null,
      thirdPartyId:       params.third_party_id      ?? null,
    };
  }
}

export default AirShopping;
