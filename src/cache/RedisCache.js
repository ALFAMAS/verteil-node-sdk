/**
 * @fileoverview Redis-backed persistent cache adapter for Verteil API responses.
 *
 * Implements the same `get` / `put` / `clear` interface as {@link VerteilCache}
 * so it can be swapped in via `VerteilClient`'s `cache` config option.
 *
 * **Optional dependency:** requires `ioredis`.
 *   `npm install ioredis`
 *
 * @example
 * import RedisCache from './src/cache/RedisCache.js';
 * const client = new VerteilClient({ ..., cache: new RedisCache({ host: 'localhost' }) });
 */

import crypto from 'crypto';

const DEFAULT_CACHEABLE_ENDPOINTS = {
  airShopping:      120,
  seatAvailability: 120,
  serviceList:      300,
};

const PREFIX = 'verteil:';

/**
 * Redis-backed cache adapter.  Survives process restarts and is shared across
 * multiple Node.js instances.
 *
 * @class RedisCache
 */
class RedisCache {
  /**
   * @param {Object} [redisOptions={}]  Options forwarded to the `ioredis` constructor.
   * @param {Object.<string, number>} [cacheableEndpoints]  endpoint → TTL (seconds).
   */
  constructor(redisOptions = {}, cacheableEndpoints = DEFAULT_CACHEABLE_ENDPOINTS) {
    this._cacheableEndpoints = cacheableEndpoints;
    this._client = RedisCache._createClient(redisOptions);
  }

  /** @private */
  static _createClient(opts) {
    let Redis;
    try {
      // Dynamic import — ioredis is an optional peer dependency
      const mod = await import('ioredis').catch(() => null);
      Redis = mod?.default ?? mod;
    } catch {
      // Synchronous fallback for environments where dynamic import is sync
    }

    if (!Redis) {
      // Try synchronous require as last resort (CJS interop)
      try {
        const { createRequire } = await import('module').catch(() => ({ createRequire: null }));
        if (createRequire) {
          const req = createRequire(import.meta.url);
          Redis = req('ioredis');
        }
      } catch { /* ignore */ }
    }

    if (!Redis) {
      throw new Error(
        'RedisCache requires the "ioredis" package. Run: npm install ioredis',
      );
    }

    return new Redis(opts);
  }

  /**
   * Factory — creates a RedisCache asynchronously, resolving after the
   * Redis connection is established.
   *
   * @param {Object} [redisOptions={}]
   * @param {Object.<string, number>} [cacheableEndpoints]
   * @returns {Promise<RedisCache>}
   */
  static async create(redisOptions = {}, cacheableEndpoints = DEFAULT_CACHEABLE_ENDPOINTS) {
    let Redis;
    try {
      const mod = await import('ioredis');
      Redis = mod.default ?? mod;
    } catch {
      throw new Error('RedisCache requires the "ioredis" package. Run: npm install ioredis');
    }

    const instance = Object.create(RedisCache.prototype);
    instance._cacheableEndpoints = cacheableEndpoints;
    instance._client = new Redis(redisOptions);

    await new Promise((resolve, reject) => {
      instance._client.once('ready', resolve);
      instance._client.once('error', reject);
    });

    return instance;
  }

  /**
   * Returns a cached response or `null` on miss.
   *
   * @param {string} endpoint
   * @param {Object} params
   * @returns {Promise<Object|null>}
   */
  async get(endpoint, params) {
    if (!this._cacheableEndpoints[endpoint]) return null;
    const key = this._key(endpoint, params);

    try {
      const raw = await this._client.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Stores a response in Redis with the endpoint's configured TTL.
   *
   * @param {string} endpoint
   * @param {Object} params
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async put(endpoint, params, data) {
    const ttl = this._cacheableEndpoints[endpoint];
    if (!ttl) return;

    const key = this._key(endpoint, params);
    try {
      await this._client.set(key, JSON.stringify(data), 'EX', ttl);
    } catch { /* non-fatal */ }
  }

  /**
   * Clears cache entries.  When `endpoint` is supplied only that endpoint's
   * keys are removed; otherwise all `verteil:*` keys are deleted.
   *
   * @param {string} [endpoint]
   * @returns {Promise<void>}
   */
  async clear(endpoint) {
    try {
      const pattern = endpoint
        ? `${PREFIX}${endpoint}:*`
        : `${PREFIX}*`;

      let cursor = '0';
      do {
        const [nextCursor, keys] = await this._client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length) await this._client.del(...keys);
      } while (cursor !== '0');
    } catch { /* non-fatal */ }
  }

  /**
   * Closes the underlying Redis connection.
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    await this._client.quit();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  _key(endpoint, params) {
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(params ?? {}))
      .digest('hex');
    return `${PREFIX}${endpoint}:${hash}`;
  }
}

export default RedisCache;
