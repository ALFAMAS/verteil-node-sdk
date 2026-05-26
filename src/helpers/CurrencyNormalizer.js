/**
 * @fileoverview Multi-currency normalization helper for Verteil API responses.
 *
 * `AirShoppingResponse` and `FlightPriceResponse` can return prices in mixed
 * currencies when multiple airlines are included.  This helper converts all
 * monetary fields to a single target currency using caller-supplied exchange
 * rates, returning a consistent single-currency view.
 *
 * @example
 * import CurrencyNormalizer from './src/helpers/CurrencyNormalizer.js';
 *
 * // fxRates: { USD: 1, EUR: 0.92, INR: 83.4, GBP: 0.79 }
 * const normalizer = new CurrencyNormalizer('USD', fxRates);
 * const normalized = normalizer.normalizeOffers(offers);
 */

/** Fields recognised as monetary across Verteil NDC objects. */
const PRICE_FIELDS = [
  'BaseAmount', 'TaxAmount', 'TotalAmount', 'EquivAmount',
  'Amount', 'Price', 'Total', 'Taxes', 'FareAmount',
];

/**
 * Converts price fields in Verteil NDC response trees.
 *
 * @class CurrencyNormalizer
 */
class CurrencyNormalizer {
  /**
   * @param {string}                   targetCurrency  ISO 4217 code (e.g. `'USD'`).
   * @param {Object.<string, number>}  fxRates         Map of currency → rate relative to base.
   *   The base currency should have rate `1`.  Example: `{ USD: 1, EUR: 0.92, INR: 83.4 }`.
   * @param {number}                   [decimals=2]    Decimal places to round to.
   */
  constructor(targetCurrency, fxRates, decimals = 2) {
    this._target   = targetCurrency.toUpperCase();
    this._rates    = Object.fromEntries(
      Object.entries(fxRates).map(([k, v]) => [k.toUpperCase(), Number(v)]),
    );
    this._decimals = decimals;

    if (!this._rates[this._target]) {
      throw new Error(`fxRates must include an entry for target currency "${this._target}"`);
    }
  }

  /**
   * Normalises an array of offer objects from an AirShoppingResponse.
   *
   * @param {Object[]} offers
   * @returns {Object[]} Deep-cloned offers with all prices converted.
   */
  normalizeOffers(offers) {
    return (offers ?? []).map(offer => this._normalizeNode(offer));
  }

  /**
   * Normalises a single priced itinerary / offer object.
   *
   * @param {Object} node
   * @returns {Object}
   */
  normalizeNode(node) {
    return this._normalizeNode(node);
  }

  /**
   * Converts a single amount from `fromCurrency` to the target currency.
   *
   * @param {number} amount
   * @param {string} fromCurrency
   * @returns {number}
   */
  convert(amount, fromCurrency) {
    const from = fromCurrency?.toUpperCase();
    if (!from || from === this._target) return this._round(amount);

    const fromRate   = this._rates[from];
    const targetRate = this._rates[this._target];

    if (!fromRate) {
      throw new Error(`No exchange rate for currency "${from}"`);
    }

    // Convert: amount / fromRate * targetRate
    return this._round((amount / fromRate) * targetRate);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  _normalizeNode(node) {
    if (Array.isArray(node)) {
      return node.map(item => this._normalizeNode(item));
    }

    if (node === null || typeof node !== 'object') return node;

    const result = {};
    const currency = node.Code ?? node.CurrencyCode ?? node.currency ?? null;

    for (const [key, val] of Object.entries(node)) {
      if (PRICE_FIELDS.includes(key) && typeof val === 'object' && val !== null) {
        // NDC price: { value: 123.45, Code: 'EUR' }
        const amt = Number(val.value ?? val.Amount ?? 0);
        const cur = val.Code ?? val.CurrencyCode ?? currency ?? this._target;
        result[key] = {
          ...val,
          value:        this.convert(amt, cur),
          Code:         this._target,
          _originalAmt: amt,
          _originalCur: cur,
        };
      } else if (key === 'Code' || key === 'CurrencyCode') {
        // Replace currency indicators
        result[key] = this._target;
      } else {
        result[key] = this._normalizeNode(val);
      }
    }

    return result;
  }

  /** @private */
  _round(n) {
    const factor = 10 ** this._decimals;
    return Math.round(n * factor) / factor;
  }
}

export default CurrencyNormalizer;
