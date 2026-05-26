/**
 * @fileoverview Runtime health and metrics monitoring for the Verteil API wrapper.
 *
 * Tracks per-endpoint success/failure counts, response times, error history,
 * cache hit statistics, and overall service health.  All data is held in-process
 * via NodeCache; metrics older than `metricsRetentionHours` are automatically
 * evicted.
 */

import NodeCache from 'node-cache';

const METRICS_KEY     = 'verteil_metrics';
const ENDPOINT_KEY    = 'verteil_endpoint_metrics';
const CACHE_STATS_KEY = 'verteil_cache_stats';

/**
 * Monitors Verteil API health and records operational metrics.
 *
 * @class HealthMonitor
 *
 * @example
 * const monitor = new HealthMonitor(tokenStorage);
 * monitor.recordMetric('airShopping', 342, 200);
 * const report = monitor.checkHealth();
 */
class HealthMonitor {
  /**
   * @param {import('../security/SecureTokenStorage.js').default} tokenStorage
   *   Used to determine whether a valid token is currently held.
   * @param {number} [metricsRetentionHours=24]
   *   How long (in hours) to retain metric entries.
   */
  constructor(tokenStorage, metricsRetentionHours = 24) {
    /** @private */
    this._tokenStorage = tokenStorage;

    /** @private @type {number} seconds */
    this._retentionSecs = metricsRetentionHours * 3600;

    /** @private @type {NodeCache} */
    this._store = new NodeCache({ useClones: false });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns a snapshot of the overall API health.
   *
   * @returns {{
   *   status: string,
   *   metrics: Object,
   *   lastErrors: Array,
   *   cacheStatus: Object,
   *   tokenStatus: Object
   * }}
   */
  checkHealth() {
    return {
      status:      this._getOverallStatus(),
      metrics:     this._getMetricsSummary(),
      lastErrors:  this._getRecentErrors(),
      cacheStatus: this._getCacheStatus(),
      tokenStatus: this._getTokenStatus(),
    };
  }

  /**
   * Records a single API call metric.
   *
   * @param {string} endpoint   Verteil endpoint name.
   * @param {number} duration   Response time in milliseconds.
   * @param {number} statusCode HTTP status code received.
   * @returns {void}
   */
  recordMetric(endpoint, duration, statusCode) {
    const metric = {
      timestamp:   Date.now(),
      endpoint,
      duration,
      status_code: statusCode,
    };

    // Append to rolling metrics array
    const metrics = this._store.get(METRICS_KEY) || [];
    metrics.push(metric);

    // Prune metrics older than retention window
    const cutoff  = Date.now() - this._retentionSecs * 1000;
    const trimmed = metrics.filter(m => m.timestamp > cutoff);
    this._store.set(METRICS_KEY, trimmed, this._retentionSecs);

    // Append error entry if applicable
    if (statusCode >= 400) {
      const errors = this._store.get('verteil_recent_errors') || [];
      errors.unshift({ timestamp: Date.now(), endpoint, status_code: statusCode });
      this._store.set('verteil_recent_errors', errors.slice(0, 10), this._retentionSecs);
    }

    this._updateEndpointMetrics(endpoint, duration, statusCode);
  }

  /**
   * Updates the cache-hit / miss counters.
   *
   * @param {boolean} hit  Whether the request was a cache hit.
   * @returns {void}
   */
  recordCacheAccess(hit) {
    const stats = this._store.get(CACHE_STATS_KEY) || { hits: 0, misses: 0 };
    if (hit) stats.hits++; else stats.misses++;
    this._store.set(CACHE_STATS_KEY, stats, this._retentionSecs);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  _getOverallStatus() {
    const summary = this._getMetricsSummary();
    if (summary.errorRate > 25)        return 'critical';
    if (summary.errorRate > 10)        return 'degraded';
    if (summary.avgResponseTime > 2000) return 'slow';
    return 'healthy';
  }

  /** @private */
  _getMetricsSummary() {
    const metrics = this._store.get(METRICS_KEY) || [];
    if (!metrics.length) return { requestsPerMinute: 0, avgResponseTime: 0, errorRate: 0, endpointStats: {} };

    const fiveMinAgo = Date.now() - 300_000;
    const recent     = metrics.filter(m => m.timestamp > fiveMinAgo);

    const errors         = metrics.filter(m => m.status_code >= 400).length;
    const avgResponseTime = metrics.reduce((s, m) => s + m.duration, 0) / metrics.length;

    return {
      requestsPerMinute: recent.length / 5,
      avgResponseTime:   Math.round(avgResponseTime * 100) / 100,
      errorRate:         Math.round((errors / metrics.length) * 10000) / 100,
      endpointStats:     this._calcEndpointStats(metrics),
    };
  }

  /** @private */
  _calcEndpointStats(metrics) {
    const byEndpoint = {};
    for (const m of metrics) {
      if (!byEndpoint[m.endpoint]) byEndpoint[m.endpoint] = [];
      byEndpoint[m.endpoint].push(m);
    }
    const result = {};
    for (const [ep, arr] of Object.entries(byEndpoint)) {
      const errors = arr.filter(m => m.status_code >= 400).length;
      result[ep] = {
        count:       arr.length,
        avgDuration: Math.round(arr.reduce((s, m) => s + m.duration, 0) / arr.length),
        errorRate:   Math.round((errors / arr.length) * 10000) / 100,
      };
    }
    return result;
  }

  /** @private */
  _getRecentErrors() {
    return (this._store.get('verteil_recent_errors') || []).map(e => ({
      timestamp:  new Date(e.timestamp).toISOString(),
      endpoint:   e.endpoint,
      statusCode: e.status_code,
    }));
  }

  /** @private */
  _getCacheStatus() {
    const stats  = this._store.get(CACHE_STATS_KEY) || { hits: 0, misses: 0 };
    const total  = stats.hits + stats.misses;
    const hitRate = total > 0 ? Math.round((stats.hits / total) * 10000) / 100 : 0;
    return {
      status:  hitRate > 80 ? 'optimal' : hitRate > 50 ? 'acceptable' : 'suboptimal',
      hitRate,
      hits:    stats.hits,
      misses:  stats.misses,
    };
  }

  /** @private */
  _getTokenStatus() {
    const valid = this._tokenStorage.hasValidToken();
    return {
      status: valid ? 'active' : 'missing',
      valid,
    };
  }

  /** @private */
  _updateEndpointMetrics(endpoint, duration, statusCode) {
    const metrics = this._store.get(ENDPOINT_KEY) || {};
    if (!metrics[endpoint]) {
      metrics[endpoint] = { success: 0, failures: 0, responseTimes: [], lastUpdated: Date.now() };
    }
    const ep = metrics[endpoint];
    if (statusCode >= 200 && statusCode < 300) ep.success++;
    else ep.failures++;

    ep.responseTimes.push(duration);
    if (ep.responseTimes.length > 100) ep.responseTimes.shift();
    ep.lastUpdated = Date.now();

    this._store.set(ENDPOINT_KEY, metrics, this._retentionSecs);
  }
}

export default HealthMonitor;
