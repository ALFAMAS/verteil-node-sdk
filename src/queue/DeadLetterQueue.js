/**
 * @fileoverview Dead-letter queue for Verteil API requests that exhausted all retries.
 *
 * Failed requests are persisted so they can be inspected, replayed manually, or
 * consumed by a background worker.  Two backends are supported:
 *
 *  - **Memory** (default): in-process array — lost on restart, useful for dev/test.
 *  - **Redis**  (optional): persistent queue backed by a Redis LIST.
 *    Requires `npm install ioredis`.
 *
 * Redis data structure choice — why a LIST?
 *   Redis lists offer O(1) RPUSH (enqueue right) and LPOP (dequeue left), making
 *   them ideal FIFO queues.  LINDEX(0) provides O(1) peek without removal.  We
 *   avoid Redis Streams here for simplicity — if you need consumer groups,
 *   message acknowledgment at scale, or replay by offset, consider migrating
 *   the backend to a Stream (XADD / XREAD / XACK).
 *
 * Entry shape:
 *   {
 *     id:         'dlq_<timestamp>_<counter>',
 *     endpoint:   'airShopping',
 *     params:     { ... },       // original request parameters (sanitised)
 *     error:      { message, code, status },
 *     enqueuedAt: ISO-8601 string,
 *     attempts:   0,             // replay counter — increment on each retry
 *   }
 *
 * @example
 * // Memory backend (default, no deps)
 * const dlq = new DeadLetterQueue();
 * client.setDeadLetterQueue(dlq);
 *
 * // Redis backend
 * const dlq = await DeadLetterQueue.createRedis({ host: 'localhost' });
 * client.setDeadLetterQueue(dlq);
 *
 * // Replay a failed request
 * const entry = await dlq.peek();
 * if (entry) {
 *   await client[entry.endpoint](entry.params);
 *   await dlq.ack(entry.id);
 * }
 */

/**
 * Dead-letter queue with pluggable backend.
 *
 * @class DeadLetterQueue
 */
class DeadLetterQueue {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxSize=1000]   Maximum entries (memory backend only).
   */
  constructor(options = {}) {
    this._maxSize = options.maxSize ?? 1000;
    this._queue   = [];   // memory backend
    this._counter = 0;
    this._backend = 'memory';
  }

  /**
   * Creates a Redis-backed `DeadLetterQueue`.
   *
   * @param {Object} [redisOptions={}]
   * @param {string} [listKey='verteil:dlq']
   * @returns {Promise<DeadLetterQueue>}
   */
  static async createRedis(redisOptions = {}, listKey = 'verteil:dlq') {
    let Redis;
    try {
      const mod = await import('ioredis');
      Redis = mod.default ?? mod;
    } catch {
      throw new Error('Redis DLQ requires "ioredis". Run: npm install ioredis');
    }

    const instance = new DeadLetterQueue();
    instance._backend  = 'redis';
    instance._listKey  = listKey;
    instance._redis    = new Redis(redisOptions);

    await new Promise((resolve, reject) => {
      instance._redis.once('ready', resolve);
      instance._redis.once('error', reject);
    });

    return instance;
  }

  /**
   * Enqueues a failed request.
   *
   * The error object is flattened to a plain {message, code, status} shape before
   * serialisation.  This is intentional: Error instances carry non-serialisable
   * properties (stack frames, circular references) that would break JSON.stringify,
   * and the full stack is less useful than a structured summary for replay workers.
   *
   * Memory backend: when the queue reaches maxSize, the oldest entry is evicted
   * (FIFO overflow) to prevent unbounded growth.  Redis backend has no built-in
   * size limit — use LTRIM externally if needed.
   *
   * @param {string} endpoint  Verteil endpoint that failed.
   * @param {Object} params    Original request parameters.
   * @param {Error}  error     The final error after all retries.
   * @returns {Promise<string>} Entry ID (use with ack() after successful replay).
   */
  async push(endpoint, params, error) {
    const entry = {
      // Monotonic ID: timestamp provides approximate ordering; counter disambiguates
      // entries pushed in the same millisecond (e.g. during a burst of failures).
      id:         `dlq_${Date.now()}_${++this._counter}`,
      endpoint,
      params,
      // Only serialise the fields we need; Error.stack is intentionally excluded.
      error:      { message: error?.message, code: error?.code, status: error?.status },
      enqueuedAt: new Date().toISOString(),
      attempts:   0,  // replay worker should increment this on each retry attempt
    };

    if (this._backend === 'redis') {
      // RPUSH appends to the right (tail) of the list; LPOP dequeues from the left
      // (head), giving us FIFO semantics with O(1) operations at both ends.
      await this._redis.rpush(this._listKey, JSON.stringify(entry));
    } else {
      // Drop the oldest entry when the queue is full to bound memory usage.
      if (this._queue.length >= this._maxSize) this._queue.shift();
      this._queue.push(entry);
    }

    return entry.id;
  }

  /**
   * Returns the oldest entry without removing it.  Returns `null` when empty.
   *
   * @returns {Promise<Object|null>}
   */
  async peek() {
    if (this._backend === 'redis') {
      const raw = await this._redis.lindex(this._listKey, 0);
      return raw ? JSON.parse(raw) : null;
    }
    return this._queue[0] ?? null;
  }

  /**
   * Removes and returns the oldest entry (FIFO).  Returns `null` when empty.
   *
   * @returns {Promise<Object|null>}
   */
  async shift() {
    if (this._backend === 'redis') {
      const raw = await this._redis.lpop(this._listKey);
      return raw ? JSON.parse(raw) : null;
    }
    return this._queue.shift() ?? null;
  }

  /**
   * Acknowledges (removes) an entry by ID.
   *
   * @param {string} id
   * @returns {Promise<boolean>} `true` if the entry was found and removed.
   */
  async ack(id) {
    if (this._backend === 'redis') {
      const len = await this._redis.llen(this._listKey);
      for (let i = 0; i < len; i++) {
        const raw = await this._redis.lindex(this._listKey, i);
        if (!raw) continue;
        const entry = JSON.parse(raw);
        if (entry.id === id) {
          await this._redis.lrem(this._listKey, 1, raw);
          return true;
        }
      }
      return false;
    }

    const idx = this._queue.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this._queue.splice(idx, 1);
    return true;
  }

  /**
   * Returns all queued entries.
   *
   * @returns {Promise<Object[]>}
   */
  async getAll() {
    if (this._backend === 'redis') {
      const items = await this._redis.lrange(this._listKey, 0, -1);
      return items.map(r => JSON.parse(r));
    }
    return [...this._queue];
  }

  /**
   * Returns the number of items in the queue.
   *
   * @returns {Promise<number>}
   */
  async size() {
    if (this._backend === 'redis') {
      return this._redis.llen(this._listKey);
    }
    return this._queue.length;
  }

  /**
   * Empties the queue.
   *
   * @returns {Promise<void>}
   */
  async clear() {
    if (this._backend === 'redis') {
      await this._redis.del(this._listKey);
    } else {
      this._queue = [];
    }
  }

  /**
   * Closes the Redis connection (no-op for memory backend).
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this._backend === 'redis') await this._redis.quit();
  }
}

export default DeadLetterQueue;
