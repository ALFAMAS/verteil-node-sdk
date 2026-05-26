/**
 * @fileoverview Prometheus metrics collector for the Verteil NDC wrapper.
 *
 * Exposes per-endpoint counters and histograms that can be scraped by
 * Prometheus or any OpenMetrics-compatible collector.
 *
 * **Optional dependency:** requires `prom-client`.
 *   `npm install prom-client`
 *
 * If `prom-client` is not installed, all methods silently no-op so the
 * application continues to work without metrics.
 *
 * Metrics exposed:
 *  - `verteil_requests_total`         counter  { endpoint, status }
 *  - `verteil_latency_seconds`        histogram { endpoint }
 *  - `verteil_cache_hits_total`       counter  { endpoint }
 *  - `verteil_cache_misses_total`     counter  { endpoint }
 *  - `verteil_errors_total`           counter  { endpoint, code }
 *  - `verteil_retries_total`          counter  { endpoint }
 *  - `verteil_circuit_state`          gauge    { endpoint, state }
 *
 * @example
 * import VerteilMetrics from './src/metrics/VerteilMetrics.js';
 * import express        from 'express';
 *
 * const metrics = await VerteilMetrics.create();
 * const client  = new VerteilClient({ ..., metrics });
 *
 * const app = express();
 * app.get('/metrics', async (req, res) => {
 *   res.set('Content-Type', metrics.contentType());
 *   res.end(await metrics.export());
 * });
 */

let promClient = null;

async function loadProm() {
  if (promClient !== null) return promClient;
  try {
    const mod = await import('prom-client');
    promClient = mod.default ?? mod;
  } catch {
    promClient = false;
  }
  return promClient;
}

/**
 * @class VerteilMetrics
 */
class VerteilMetrics {
  constructor(registry) {
    this._registry = registry;
    this._counters  = {};
    this._histograms = {};
    this._gauges    = {};
  }

  /**
   * Creates and initialises a `VerteilMetrics` instance.
   * Loads `prom-client` asynchronously; falls back to no-ops if unavailable.
   *
   * @param {Object} [options]
   * @param {boolean} [options.collectDefaultMetrics=false]  Collect Node.js default metrics.
   * @returns {Promise<VerteilMetrics>}
   */
  static async create(options = {}) {
    const prom = await loadProm();
    if (!prom) {
      // Return a no-op instance
      return new VerteilMetrics(null);
    }

    const registry = new prom.Registry();

    if (options.collectDefaultMetrics) {
      prom.collectDefaultMetrics({ register: registry });
    }

    const instance = new VerteilMetrics(registry);

    instance._counters.requests = new prom.Counter({
      name:       'verteil_requests_total',
      help:       'Total Verteil API requests',
      labelNames: ['endpoint', 'status'],
      registers:  [registry],
    });

    instance._histograms.latency = new prom.Histogram({
      name:       'verteil_latency_seconds',
      help:       'Verteil API request latency in seconds',
      labelNames: ['endpoint'],
      buckets:    [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers:  [registry],
    });

    instance._counters.cacheHits = new prom.Counter({
      name:       'verteil_cache_hits_total',
      help:       'Verteil cache hits',
      labelNames: ['endpoint'],
      registers:  [registry],
    });

    instance._counters.cacheMisses = new prom.Counter({
      name:       'verteil_cache_misses_total',
      help:       'Verteil cache misses',
      labelNames: ['endpoint'],
      registers:  [registry],
    });

    instance._counters.errors = new prom.Counter({
      name:       'verteil_errors_total',
      help:       'Verteil API errors',
      labelNames: ['endpoint', 'code'],
      registers:  [registry],
    });

    instance._counters.retries = new prom.Counter({
      name:       'verteil_retries_total',
      help:       'Verteil API retry attempts',
      labelNames: ['endpoint'],
      registers:  [registry],
    });

    instance._gauges.circuitState = new prom.Gauge({
      name:       'verteil_circuit_state',
      help:       'Circuit breaker state: 0=CLOSED 1=HALF_OPEN 2=OPEN',
      labelNames: ['endpoint'],
      registers:  [registry],
    });

    return instance;
  }

  /** Records a completed request. */
  recordRequest(endpoint, statusCode) {
    this._counters.requests?.inc({ endpoint, status: String(statusCode) });
  }

  /** Records latency for a request. Returns a function to call when done. */
  startTimer(endpoint) {
    const end = this._histograms.latency?.startTimer({ endpoint });
    return () => end?.();
  }

  /** Records a cache hit. */
  recordCacheHit(endpoint) {
    this._counters.cacheHits?.inc({ endpoint });
  }

  /** Records a cache miss. */
  recordCacheMiss(endpoint) {
    this._counters.cacheMisses?.inc({ endpoint });
  }

  /** Records an error. */
  recordError(endpoint, code = 'unknown') {
    this._counters.errors?.inc({ endpoint, code: String(code) });
  }

  /** Records a retry attempt. */
  recordRetry(endpoint) {
    this._counters.retries?.inc({ endpoint });
  }

  /**
   * Updates the circuit-breaker state gauge.
   *
   * @param {string} endpoint
   * @param {'CLOSED'|'HALF_OPEN'|'OPEN'} state
   */
  recordCircuitState(endpoint, state) {
    const val = state === 'CLOSED' ? 0 : state === 'HALF_OPEN' ? 1 : 2;
    this._gauges.circuitState?.set({ endpoint }, val);
  }

  /**
   * Returns the Prometheus-formatted metrics string.
   *
   * @returns {Promise<string>}
   */
  async export() {
    if (!this._registry) return '# no prom-client installed\n';
    return this._registry.metrics();
  }

  /**
   * Returns the Content-Type header value for the metrics endpoint.
   *
   * @returns {string}
   */
  contentType() {
    return this._registry?.contentType ?? 'text/plain; version=0.0.4';
  }
}

export default VerteilMetrics;
