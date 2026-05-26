/**
 * @fileoverview Multi-hop / codeshare itinerary builder for the Verteil NDC wrapper.
 *
 * Stitches together AirShopping → FlightPrice → OrderCreate into a single
 * `book(itinerary, passengers, payment)` call, automatically threading offer
 * IDs and offer-item IDs between steps.
 *
 * @example
 * import { VerteilClient }    from '@verteil/cnv-js';
 * import ItineraryBuilder     from './src/helpers/ItineraryBuilder.js';
 *
 * const client  = new VerteilClient({ ... });
 * const builder = new ItineraryBuilder(client);
 *
 * const booking = await builder.book(
 *   {
 *     originDestinations: [{
 *       departureAirport: 'DEL', arrivalAirport: 'DXB',
 *       departureDate:    '2025-12-01',
 *     }],
 *     cabin:   'Y',
 *     sortBy:  'price',
 *   },
 *   [{ passengerType: 'ADT', count: 1 }],
 *   { type: 'card', card: { number: '...', cvv: '...', expiry: '...', holderName: '...' } },
 * );
 */

/**
 * @class ItineraryBuilder
 */
class ItineraryBuilder {
  /**
   * @param {import('../VerteilClient.js').default} client - Authenticated VerteilClient.
   * @param {Object} [options]
   * @param {string} [options.sortBy='price']  Sort offers by: 'price' | 'duration' | 'stops'.
   */
  constructor(client, options = {}) {
    this._client = client;
    this._sortBy = options.sortBy ?? 'price';
  }

  /**
   * Executes the full shop → price → book pipeline.
   *
   * @param {Object}   itinerary                - Shopping parameters.
   * @param {Array}    itinerary.originDestinations
   * @param {string}   [itinerary.cabin]
   * @param {string[]} [itinerary.preferredCarriers]
   * @param {string}   [itinerary.sortBy]        Override instance default.
   * @param {Array}    passengers               - Passenger type + count pairs.
   * @param {Object}   payment                  - Payment details (card / cash).
   * @param {Object}   [options]
   * @param {number}   [options.offerIndex=0]   Which offer to select (0 = cheapest/best).
   * @returns {Promise<Object>} OrderCreate response.
   */
  async book(itinerary, passengers, payment, options = {}) {
    const offerIndex = options.offerIndex ?? 0;

    // ── Step 1: AirShopping ───────────────────────────────────────────────────
    // Search for available offers matching the itinerary and passenger types.
    // The result contains ShoppingResponseID which must be threaded into the
    // FlightPrice call so Verteil can correlate the pricing to the search.
    const shopResult = await this._client.airShopping(
      this._buildShoppingParams(itinerary, passengers),
    );

    const offers = this._extractOffers(shopResult);
    if (!offers.length) {
      throw new Error('No offers returned from AirShopping');
    }

    // Sort offers so offerIndex=0 (the default) picks the best option by
    // the configured sort criterion.  Callers can request a different offer
    // via options.offerIndex if they want the second-cheapest, etc.
    const sortedOffers = this._sortOffers(offers, itinerary.sortBy ?? this._sortBy);
    const selectedOffer = sortedOffers[offerIndex];
    if (!selectedOffer) {
      throw new Error(`Offer index ${offerIndex} out of range (${sortedOffers.length} offers available)`);
    }

    // ── Step 2: FlightPrice ───────────────────────────────────────────────────
    // Price the selected offer.  This step is mandatory in NDC — you cannot book
    // an offer returned by AirShopping directly because prices are advisory and
    // may have changed since the search.  FlightPrice returns a repriced offer
    // with a new OfferID and OfferItemIDs that must be used in OrderCreate.
    const priceResult = await this._client.flightPrice(
      this._buildPriceParams(selectedOffer, shopResult, passengers),
    );

    const pricedOffer = this._extractPricedOffer(priceResult);

    // ── Step 3: OrderCreate ───────────────────────────────────────────────────
    // Create the booking using the priced offer's IDs (not the shopping IDs).
    // Mixing IDs from the wrong step is the most common NDC integration error.
    return this._client.createOrder(
      this._buildOrderParams(pricedOffer, priceResult, passengers, payment),
    );
  }

  /**
   * Returns a sorted list of available offers without booking.
   * Useful for displaying options to the user before committing.
   *
   * @param {Object} itinerary
   * @param {Array}  passengers
   * @returns {Promise<Object[]>} Sorted offer summaries.
   */
  async search(itinerary, passengers) {
    const shopResult = await this._client.airShopping(
      this._buildShoppingParams(itinerary, passengers),
    );

    const offers = this._extractOffers(shopResult);
    return this._sortOffers(offers, itinerary.sortBy ?? this._sortBy);
  }

  /**
   * Prices a specific offer by reference without booking it.
   *
   * @param {Object} offer      Offer object from `search()`.
   * @param {Object} shopResult Raw AirShopping response.
   * @param {Array}  passengers
   * @returns {Promise<Object>} Priced offer.
   */
  async price(offer, shopResult, passengers) {
    return this._client.flightPrice(
      this._buildPriceParams(offer, shopResult, passengers),
    );
  }

  // ── Private builders ──────────────────────────────────────────────────────

  /** @private */
  _buildShoppingParams(itinerary, passengers) {
    return {
      coreQuery: {
        originDestinations: itinerary.originDestinations.map((od, i) => ({
          key:             `OD${i + 1}`,
          departureAirport: od.departureAirport,
          arrivalAirport:   od.arrivalAirport,
          departureDate:    od.departureDate,
        })),
      },
      travelers: passengers.map((p, i) => ({
        key:           `T${i + 1}`,
        passengerType:  p.passengerType,
        count:          p.count ?? 1,
      })),
      preference: {
        cabin:            itinerary.cabin            ?? 'Y',
        preferredCarriers: itinerary.preferredCarriers ?? [],
      },
    };
  }

  /** @private */
  _buildPriceParams(offer, shopResult, passengers) {
    return {
      query: {
        originDestinations: shopResult?.OriginDestinations ?? [],
        offers: [{
          owner:      offer.owner,
          offerId:    offer.offerId,
          channel:    offer.channel ?? 'NDC',
          offerItems: (offer.offerItems ?? []).map(item => ({
            id:   item.id,
            refs: item.refs ?? [],
          })),
        }],
      },
      travelers: passengers.map((p, i) => ({
        objectKey:     `T${i + 1}`,
        passengerType:  p.passengerType,
      })),
      shoppingResponseId: shopResult?.ShoppingResponseID ?? {},
    };
  }

  /** @private */
  _buildOrderParams(pricedOffer, priceResult, passengers, payment) {
    return {
      query: {
        orderItems: (pricedOffer?.OfferItemIDs?.OfferItemID ?? []).map(item => ({
          offerItemRefId: item.value ?? item,
          paxRefIds:      passengers.map((_, i) => `T${i + 1}`),
        })),
        offerId:    pricedOffer?.OfferID?.value,
        owner:      pricedOffer?.OfferID?.Owner,
        channel:    pricedOffer?.OfferID?.Channel ?? 'NDC',
      },
      passengers: passengers.map((p, i) => ({
        objectKey:    `T${i + 1}`,
        passengerType: p.passengerType,
        ...p,
      })),
      payments: payment ? [payment] : [],
    };
  }

  /** @private */
  _extractOffers(shopResult) {
    const raw = shopResult?.AirShoppingRS?.OffersGroup?.AirlineOffers?.AirlineOffer
      ?? shopResult?.offers
      ?? [];
    return raw.flat();
  }

  /** @private */
  _extractPricedOffer(priceResult) {
    return priceResult?.FlightPriceRS?.PricedOffer
      ?? priceResult?.pricedOffer
      ?? priceResult?.Offer
      ?? priceResult;
  }

  /** @private */
  _sortOffers(offers, sortBy) {
    const clone = [...offers];

    const getPrice = o =>
      Number(o?.TotalPrice?.DetailCurrencyPrice?.Total?.value ?? o?.price ?? 0);
    const getDuration = o =>
      Number(o?.totalDuration ?? o?.FlightSegments?.reduce((acc, s) => acc + (s.duration ?? 0), 0) ?? 0);
    const getStops = o =>
      Number(o?.Stops ?? o?.stops ?? 0);

    switch (sortBy) {
      case 'duration': return clone.sort((a, b) => getDuration(a) - getDuration(b));
      case 'stops':    return clone.sort((a, b) => getStops(a) - getStops(b));
      case 'price':
      default:         return clone.sort((a, b) => getPrice(a) - getPrice(b));
    }
  }
}

export default ItineraryBuilder;
