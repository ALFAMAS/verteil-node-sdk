/**
 * @fileoverview Redis-backed distributed rate limiter for Verteil API endpoints.
 *
 * Implements the same `attempt` / `remaining` / `retryAfter` interface as
 * {@link RateLimiter} so it can be swapped in via the `VerteilClient`
 * `rateLimiter` config option.
 *
 * Uses a Redis sorted-set sliding window: each request timestamp is stored as
 * a member, and stale entries are pruned atomically with ZADD + ZREMRANGEBYSCORE.
 *
 * **Optional dependency:** requires `ioredis`.
 *   `npm install ioredis`
 */

const DEFAULT_LIMITS = {
  default:     { requests: 60, duration: 60 },
  airShopping: { requests: 30, duration: 60 },
  orderCreate: { requests: 20, duration: 60 },
};

const PREFIX = 'verteil:ratelimit:';

/**
 * Distributed Redis-backed sliding-window rate limiter.
 *
 * @class RedisRateLimiter
 *
 * @example
 * const limiter = await RedisRateLimiter.create({ host: 'localhost' });
 * const client  = new VerteilClient({ ..., rateLimiter: limiter });
 */
class RedisRateLimiter {
  /**
   * @param {Object} redisClient - Connected ioredis client instance.
   * @param {Object.<string, {requests: number, duration: number}>} [limits]
   */
  constructor(redisClient, limits = {}) {
    this._client = redisClient;
    this._limits = { ...DEFAULT_LIMITS, ...limits };
  }

  /**
   * Factory — creates a `RedisRateLimiter` with a fresh ioredis connection.
   *
   * @param {Object} [redisOptions={}]
   * @param {Object} [limits={}]
   * @returns {Promise<RedisRateLimiter>}
   */
  static async create(redisOptions = {}, limits = {}) {
    let Redis;
    try {
      const mod = await import('ioredis');
      Redis = mod.default ?? mod;
    } catch {
      throw new Error('RedisRateLimiter requires the "ioredis" package. Run: npm install ioredis');
    }

    const client = new Redis(redisOptions);
    await new Promise((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
    });

    return new RedisRateLimiter(client, limits);
  }

  /**
   * Records a request attempt.  Returns `true` if within limit, `false` if exceeded.
   *
   * @param {string} endpoint
   * @returns {Promise<boolean>}
   */
  async attempt(endpoint) {
    const { requests, duration } = this._getLimit(endpoint);
    const key  = this._key(endpoint);
    const now  = Date.now();
    const cutoff = now - duration * 1000;

    const pipeline = this._client.pipeline();
    pipeline.zremrangebyscore(key, '-inf', cutoff);
    pipeline.zcard(key);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.expire(key, duration + 1);

    const results = await pipeline.exec();
    const count = results[1][1]; // zcard result before the new zadd

    if (count >= requests) {
      // Roll back the zadd
      await this._client.zremrangebyscore(key, now, now);
      return false;
    }

    return true;
  }

  /**
   * Returns remaining allowed requests for the current window.
   *
   * @param {string} endpoint
   * @returns {Promise<number>}
   */
  async remaining(endpoint) {
    const { requests, duration } = this._getLimit(endpoint);
    const key    = this._key(endpoint);
    const cutoff = Date.now() - duration * 1000;

    await this._client.zremrangebyscore(key, '-inf', cutoff);
    const count = await this._client.zcard(key);
    return Math.max(0, requests - count);
  }

  /**
   * Returns seconds until the oldest entry in the window expires.
   *
   * @param {string} endpoint
   * @returns {Promise<number>}
   */
  async retryAfter(endpoint) {
    const { duration } = this._getLimit(endpoint);
    const key = this._key(endpoint);

    const oldest = await this._client.zrange(key, 0, 0, 'WITHSCORES');
    if (!oldest || oldest.length < 2) return 0;

    const oldestTs = Number(oldest[1]);
    const resetAt  = oldestTs + duration * 1000;
    return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  }

  /**
   * Clears rate-limit data for an endpoint.
   *
   * @param {string} endpoint
   * @returns {Promise<void>}
   */
  async clear(endpoint) {
    await this._client.del(this._key(endpoint));
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
  _key(endpoint) {
    return `${PREFIX}${endpoint}`;
  }

  /** @private */
  _getLimit(endpoint) {
    return this._limits[endpoint] ?? this._limits.default;
  }
}

export default RedisRateLimiter;
