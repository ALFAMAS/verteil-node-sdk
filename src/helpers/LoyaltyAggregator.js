/**
 * @fileoverview Loyalty program aggregator for Verteil NDC responses.
 *
 * When a recognized traveler carries multiple frequent-flyer program accounts,
 * this helper ranks available carriers by miles-earning potential using a
 * configurable mileage-rate map, then injects the best-matching ProgramID
 * per segment before the request is sent.
 *
 * @example
 * import LoyaltyAggregator from './src/helpers/LoyaltyAggregator.js';
 *
 * const aggregator = new LoyaltyAggregator({
 *   // Airline code → miles earned per USD spent
 *   mileageRates: { EK: 8, QR: 7, AI: 5, '6E': 3 },
 * });
 *
 * // Select best program for each segment
 * const enrichedTravelers = aggregator.enrichTravelers(travelers, segments);
 *
 * // Rank offers by total miles earned
 * const ranked = aggregator.rankOffersByMiles(offers, travelers);
 */

/**
 * @class LoyaltyAggregator
 */
class LoyaltyAggregator {
  /**
   * @param {Object} [options]
   * @param {Object.<string, number>} [options.mileageRates={}]
   *   Map of IATA airline code → miles earned per USD of base fare.
   * @param {boolean} [options.preferHigherTier=true]
   *   When true, break rate ties in favour of the program with a higher
   *   tier (Elite > Gold > Silver > standard) based on account-number prefix
   *   heuristics (override via `tierMap`).
   * @param {Object.<string, number>} [options.tierMap={}]
   *   Map of `airlineCode:programId` → tier weight (higher = better).
   */
  constructor(options = {}) {
    this._rates           = options.mileageRates    ?? {};
    this._preferHigherTier = options.preferHigherTier ?? true;
    this._tierMap         = options.tierMap          ?? {};
  }

  /**
   * For each traveler, selects the best-matching FQTV `ProgramID` per
   * segment (based on the segment's marketing carrier) and returns a new
   * traveler array with the injected ProgramID.
   *
   * @param {Array}  travelers - Traveler objects with `frequentFlyer` arrays.
   * @param {Array}  segments  - Flight segments with `airlineCode` fields.
   * @returns {Array} Deep-cloned travelers with `selectedProgram` set per FQTV.
   */
  enrichTravelers(travelers, segments) {
    const airlineCodes = new Set(
      (segments ?? []).map(s => s.airlineCode ?? s.MarketingCarrier?.AirlineID?.value),
    );

    return (travelers ?? []).map(traveler => {
      const fqtvs = traveler.frequentFlyer ?? traveler.FQTVs ?? [];
      if (!fqtvs.length) return { ...traveler };

      const enrichedFqtvs = fqtvs.map(fqtv => {
        const code = fqtv.airlineCode ?? fqtv.AirlineID?.value;
        if (!airlineCodes.has(code)) return fqtv;

        const programId = fqtv.programId ?? fqtv.ProgramID ?? this._selectProgram(code, fqtvs);
        return { ...fqtv, ProgramID: programId, programId };
      });

      return { ...traveler, frequentFlyer: enrichedFqtvs, FQTVs: enrichedFqtvs };
    });
  }

  /**
   * Ranks offers by estimated total miles earned across all traveler FFP accounts.
   *
   * @param {Array}  offers    - Offer objects with price and carrier info.
   * @param {Array}  travelers - Traveler objects with FQTV arrays.
   * @returns {Array} Offers sorted by estimated miles (descending), each with
   *   an `_estimatedMiles` annotation.
   */
  rankOffersByMiles(offers, travelers) {
    return offers
      .map(offer => ({
        ...offer,
        _estimatedMiles: this._estimateMiles(offer, travelers),
      }))
      .sort((a, b) => b._estimatedMiles - a._estimatedMiles);
  }

  /**
   * Returns the estimated miles a traveler would earn on a specific carrier.
   *
   * @param {string} airlineCode  IATA carrier code.
   * @param {number} baseAmount   Base fare amount in any currency.
   * @param {Array}  fqtvs        Traveler's frequent flyer accounts.
   * @returns {number}
   */
  estimateMilesEarned(airlineCode, baseAmount, fqtvs) {
    const bestProgram = this._bestProgramForCarrier(airlineCode, fqtvs);
    if (!bestProgram) return 0;

    const rate = this._rates[airlineCode.toUpperCase()] ?? 1;
    return Math.floor(baseAmount * rate);
  }

  /**
   * Returns a summary of all FFP accounts with estimated annual value
   * based on the traveler's `annualSpend` assumption.
   *
   * @param {Array}  fqtvs        Traveler FQTV array.
   * @param {number} annualSpend  Assumed annual base-fare spend in base currency.
   * @returns {Array<{airline, programId, annualMiles, estimatedValue}>}
   */
  summarizePrograms(fqtvs, annualSpend) {
    return (fqtvs ?? []).map(fqtv => {
      const code  = fqtv.airlineCode ?? fqtv.AirlineID?.value ?? '';
      const rate  = this._rates[code.toUpperCase()] ?? 0;
      const miles = Math.floor(annualSpend * rate);
      return {
        airline:        code,
        programId:      fqtv.programId ?? fqtv.ProgramID,
        accountNumber:  fqtv.accountNumber ?? fqtv.Account?.Number?.[0]?.value,
        annualMiles:    miles,
        // Rough valuation: 1 mile ≈ $0.015 USD on most programs
        estimatedValue: parseFloat((miles * 0.015).toFixed(2)),
      };
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  _selectProgram(airlineCode, fqtvs) {
    const matching = fqtvs.filter(f => {
      const code = f.airlineCode ?? f.AirlineID?.value;
      return code === airlineCode;
    });

    if (!matching.length) return null;
    if (matching.length === 1) return matching[0].programId ?? matching[0].ProgramID;

    if (this._preferHigherTier) {
      matching.sort((a, b) => {
        const keyA = `${a.airlineCode ?? a.AirlineID?.value}:${a.programId ?? ''}`;
        const keyB = `${b.airlineCode ?? b.AirlineID?.value}:${b.programId ?? ''}`;
        return (this._tierMap[keyB] ?? 0) - (this._tierMap[keyA] ?? 0);
      });
    }

    return matching[0].programId ?? matching[0].ProgramID;
  }

  /** @private */
  _bestProgramForCarrier(airlineCode, fqtvs) {
    const code = airlineCode.toUpperCase();
    return (fqtvs ?? []).find(f => {
      const fc = (f.airlineCode ?? f.AirlineID?.value ?? '').toUpperCase();
      return fc === code;
    }) ?? null;
  }

  /** @private */
  _estimateMiles(offer, travelers) {
    const baseAmount = Number(
      offer?.TotalPrice?.DetailCurrencyPrice?.Total?.value
        ?? offer?.price
        ?? 0,
    );

    const allFqtvs = (travelers ?? []).flatMap(t => t.frequentFlyer ?? t.FQTVs ?? []);
    const carriers = this._extractCarriers(offer);

    return carriers.reduce((total, code) => {
      const rate    = this._rates[code.toUpperCase()] ?? 0;
      const program = this._bestProgramForCarrier(code, allFqtvs);
      return total + (program ? Math.floor(baseAmount * rate) : 0);
    }, 0);
  }

  /** @private */
  _extractCarriers(offer) {
    const carriers = new Set();
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      if (node.AirlineID?.value) carriers.add(node.AirlineID.value);
      if (node.airlineCode)      carriers.add(node.airlineCode);
      Object.values(node).forEach(v => {
        if (v && typeof v === 'object') walk(v);
      });
    };
    walk(offer);
    return [...carriers];
  }
}

export default LoyaltyAggregator;
