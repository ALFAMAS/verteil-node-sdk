/**
 * @fileoverview Response cache for the Verteil API wrapper.
 *
 * Only endpoints whose data changes infrequently are cached (air-shopping
 * results, seat availability, service lists).  Cache keys are derived from
 * an MD5 hash of the serialised request parameters, ensuring that identical
 * requests receive cached responses.
 */

import NodeCache from 'node-cache';
import crypto from 'crypto';

/**
 * Default per-endpoint cache TTLs (in seconds).
 *
 * @private
 * @type {Object.<string, number>}
 */
const DEFAULT_CACHEABLE_ENDPOINTS = {
  airShopping:      120,  // 2 minutes
  seatAvailability: 120,  // 2 minutes
  serviceList:      300,  // 5 minutes
};

const PREFIX       = 'verteil_';
const KEYS_REGISTRY = `${PREFIX}keys`;

/**
 * TTL-based in-memory response cache.
 *
 * @class VerteilCache
 *
 * @example
 * const cache = new VerteilCache();
 * const hit = cache.get('airShopping', params);
 * if (!hit) {
 *   const data = await callApi(params);
 *   cache.put('airShopping', params, data);
 * }
 */
class VerteilCache {
  /**
   * @param {Object.<string, number>} [cacheableEndpoints]
   *   Map of endpoint name → TTL in seconds.  Defaults to
   *   `DEFAULT_CACHEABLE_ENDPOINTS`.
   */
  constructor(cacheableEndpoints = DEFAULT_CACHEABLE_ENDPOINTS) {
    /** @private @type {Object.<string, number>} */
    this._cacheableEndpoints = cacheableEndpoints;

    /** @private @type {NodeCache} */
    this._store = new NodeCache({ useClones: false });
  }

  /**
   * Returns a cached response for the given endpoint + params combination,
   * or `null` if the endpoint is not cacheable / the entry has expired.
   *
   * @param {string} endpoint Verteil endpoint name (e.g. `'airShopping'`).
   * @param {Object} params   Request parameters (used to generate cache key).
   * @returns {Object|null}
   */
  get(endpoint, params) {
    if (!this._isCacheable(endpoint)) return null;
    return this._store.get(this._generateKey(endpoint, params)) ?? null;
  }

  /**
   * Stores an API response in the cache for the configured TTL.
   *
   * @param {string} endpoint  Verteil endpoint name.
   * @param {Object} params    Request parameters.
   * @param {Object} response  Response payload to cache.
   * @returns {void}
   */
  put(endpoint, params, response) {
    if (!this._isCacheable(endpoint)) return;
    const key = this._generateKey(endpoint, params);
    const ttl = this._getTtl(endpoint);
    this._store.set(key, response, ttl);
    this._registerKey(key);
  }

  /**
   * Clears cached responses.
   *
   * @param {string} [endpoint] When supplied, only entries for this endpoint
   *   are removed.  When omitted, all cached entries are cleared.
   * @returns {void}
   */
  clear(endpoint) {
    const allKeys = this._store.get(KEYS_REGISTRY) || [];

    if (!endpoint) {
      allKeys.forEach(k => this._store.del(k));
      this._store.del(KEYS_REGISTRY);
      return;
    }

    const prefix = `${PREFIX}${endpoint}_`;
    allKeys
      .filter(k => k.startsWith(prefix))
      .forEach(k => this._store.del(k));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * @private
   * @param {string} endpoint
   * @returns {boolean}
   */
  _isCacheable(endpoint) {
    return endpoint in this._cacheableEndpoints;
  }

  /**
   * @private
   * @param {string} endpoint
   * @returns {number} TTL in seconds.
   */
  _getTtl(endpoint) {
    return this._cacheableEndpoints[endpoint] ?? 0;
  }

  /**
   * Generates a deterministic cache key from endpoint + serialised params.
   *
   * @private
   * @param {string} endpoint
   * @param {Object} params
   * @returns {string}
   */
  _generateKey(endpoint, params) {
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(params))
      .digest('hex');
    return `${PREFIX}${endpoint}_${hash}`;
  }

  /**
   * Maintains a registry of active cache keys so `clear()` can enumerate them.
   *
   * Why is this needed?
   *   node-cache has no built-in `keys()` method that returns all keys matching
   *   a prefix.  Without a registry we would have no way to delete only the
   *   keys belonging to a specific endpoint in `clear(endpoint)`.
   *
   *   The registry itself is stored in the same NodeCache instance under
   *   KEYS_REGISTRY.  Its TTL is 24 hours — well above any response TTL —
   *   so it is never evicted before the entries it tracks.
   *
   *   Trade-off: the registry does not automatically remove keys when they
   *   expire (node-cache evicts them silently).  This means the registry
   *   can accumulate stale key strings over time.  The overhead is negligible
   *   for typical usage (thousands of entries, not millions), and clear()
   *   ignores get() calls that return undefined (which is what happens when a
   *   key's TTL has elapsed).
   *
   * @private
   * @param {string} key
   * @returns {void}
   */
  _registerKey(key) {
    const keys = this._store.get(KEYS_REGISTRY) || [];
    if (!keys.includes(key)) {
      keys.push(key);
      // Re-set the registry with a fresh 24-hour TTL so it never expires before
      // the last response entry it references.
      this._store.set(KEYS_REGISTRY, keys, 86400);
    }
  }
}

export default VerteilCache;
