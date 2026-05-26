/**
 * @fileoverview Structured JSON logger for Verteil API request/response lifecycle.
 *
 * Uses Winston with a daily-rotating file transport so that log files are
 * automatically archived and pruned.  All log entries are emitted as
 * newline-delimited JSON, making them directly ingestible by log-aggregation
 * platforms (Datadog, Elasticsearch, etc.).
 *
 * Sensitive fields (`password`, `token`, `authorization`, `credit_card`,
 * `card_number`, `cvv`, `secret`, `api_key`) are automatically redacted
 * before writing to disk.
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const SENSITIVE_FIELDS = new Set([
  'password', 'token', 'authorization', 'credit_card',
  'card_number', 'cvv', 'secret', 'api_key',
]);

/**
 * Production-ready logger for the Verteil API wrapper.
 *
 * @class VerteilLogger
 *
 * @example
 * const logger = new VerteilLogger({ enabled: true, logDir: './logs' });
 * logger.logRequest('airShopping', { raw_params: params, stage: 'initial' });
 */
class VerteilLogger {
  /**
   * @param {object} [options]
   * @param {boolean} [options.enabled=true]          Enable / disable all logging.
   * @param {string}  [options.logDir='logs']          Directory for log files.
   * @param {string}  [options.level='debug']          Minimum Winston log level.
   * @param {number}  [options.maxFiles=30]            Days of log files to retain.
   * @param {number}  [options.maxDepth=10]            Maximum recursion depth for data sanitisation.
   */
  constructor({
    enabled  = true,
    logDir   = 'logs',
    level    = 'debug',
    maxFiles = 30,
    maxDepth = 10,
  } = {}) {
    /** @private */
    this._enabled = enabled;

    /** @private */
    this._maxDepth = maxDepth;

    /** @private @type {winston.Logger} */
    this._logger = this._createLogger(logDir, level, maxFiles);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Logs an outbound API request at a given processing stage.
   *
   * @param {string} endpoint Verteil endpoint name.
   * @param {Object} params   Request context; a `stage` key is extracted and
   *   used as metadata (not included in the sanitised params log).
   * @returns {void}
   */
  logRequest(endpoint, params) {
    if (!this._enabled) return;

    const { stage = 'undefined', ...rest } = params;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this._logger.debug(`API Request [${requestId}] Stage: ${stage} - Endpoint: ${endpoint}`, {
      endpoint,
      stage,
      params:     this._sanitize(rest),
      timestamp:  new Date().toISOString(),
      request_id: requestId,
    });
  }

  /**
   * Logs an inbound API response.
   *
   * @param {string} endpoint   Verteil endpoint name.
   * @param {number} statusCode HTTP status code.
   * @param {Object} response   Response payload.
   * @returns {void}
   */
  logResponse(endpoint, statusCode, response) {
    if (!this._enabled) return;

    const level = this._levelForStatus(statusCode);
    this._logger[level](
      `API Response - Endpoint: ${endpoint}, Status: ${statusCode}`,
      {
        endpoint,
        status_code: statusCode,
        response:    this._sanitize(response),
        timestamp:   new Date().toISOString(),
      },
    );
  }

  /**
   * Logs an API or internal error.
   *
   * @param {string} endpoint  Verteil endpoint name.
   * @param {Error}  error     Error object.
   * @param {Object} [context] Additional context key-value pairs.
   * @returns {void}
   */
  logError(endpoint, error, context = {}) {
    if (!this._enabled) return;

    this._logger.error('API Error', {
      endpoint,
      message:   error.message,
      code:      error.code,
      stack:     (error.stack || '').split('\n').slice(0, 10),
      context:   this._sanitize(context),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Logs an authentication lifecycle event.
   *
   * @param {string} event   Short description (e.g. `'token_refreshed'`).
   * @param {Object} [ctx]   Additional metadata.
   * @returns {void}
   */
  logAuth(event, ctx = {}) {
    if (!this._enabled) return;

    this._logger.info(`Authentication: ${event}`, {
      ...this._sanitize(ctx),
      timestamp: new Date().toISOString(),
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * @private
   */
  _createLogger(logDir, level, maxFiles) {
    const fileTransport = new DailyRotateFile({
      dirname:     logDir,
      filename:    'verteil-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles:    `${maxFiles}d`,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    });

    return winston.createLogger({
      level,
      transports: [fileTransport],
      exitOnError: false,
    });
  }

  /**
   * Maps an HTTP status code to a Winston log level.
   *
   * @private
   * @param {number} statusCode
   * @returns {string}
   */
  _levelForStatus(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  /**
   * Recursively redacts sensitive fields and caps depth.
   *
   * @private
   * @param {*} data
   * @param {number} [depth=0]
   * @returns {*}
   */
  _sanitize(data, depth = 0) {
    if (depth >= this._maxDepth) return '[truncated]';

    if (Array.isArray(data)) {
      return data.map(v => this._sanitize(v, depth + 1));
    }

    if (data !== null && typeof data === 'object') {
      const result = {};
      for (const [k, v] of Object.entries(data)) {
        if (SENSITIVE_FIELDS.has(k.toLowerCase())) {
          result[k] = '******';
        } else if (typeof v === 'object' && v !== null) {
          result[k] = this._sanitize(v, depth + 1);
        } else {
          result[k] = v;
        }
      }
      return result;
    }

    return data;
  }
}

export default VerteilLogger;
