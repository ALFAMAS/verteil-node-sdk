/**
 * @fileoverview OpenTelemetry tracing integration for the Verteil NDC wrapper.
 *
 * Wraps each step of the request pipeline (cache lookup, auth, HTTP call,
 * response parse) in an OpenTelemetry span.  Works with any OTel-compatible
 * exporter (Jaeger, Zipkin, OTLP, console, etc.).
 *
 * **Optional dependency:** requires `@opentelemetry/api`.
 *   `npm install @opentelemetry/api`
 *
 * If the package is not installed the tracer silently uses a no-op
 * implementation so the application continues to work without tracing.
 *
 * @example
 * import { NodeTracerProvider } from '@opentelemetry/sdk-node';
 * import { OTLPTraceExporter }  from '@opentelemetry/exporter-trace-otlp-http';
 *
 * const provider = new NodeTracerProvider();
 * provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter()));
 * provider.register();
 *
 * const client = new VerteilClient({ ..., tracer: new VerteilTracer() });
 */

let otelApi = null;

async function loadOtel() {
  if (otelApi !== null) return otelApi;
  try {
    const mod = await import('@opentelemetry/api');
    otelApi = mod.default ?? mod;
  } catch {
    otelApi = false; // mark as unavailable
  }
  return otelApi;
}

/**
 * Thin OpenTelemetry adapter.  Emits spans per pipeline stage.
 *
 * @class VerteilTracer
 */
class VerteilTracer {
  /**
   * @param {string} [serviceName='verteil-wrapper']
   */
  constructor(serviceName = 'verteil-wrapper') {
    this._serviceName = serviceName;
    this._tracer = null; // resolved lazily
  }

  /**
   * Wraps an async function in an OTel span.
   *
   * @param {string}   spanName  Descriptive span name.
   * @param {Object}   attrs     Key-value span attributes.
   * @param {Function} fn        `async (span) => result`
   * @returns {Promise<*>}
   */
  async trace(spanName, attrs, fn) {
    const tracer = await this._getTracer();

    if (!tracer) {
      return fn(null);
    }

    const api = otelApi;
    return tracer.startActiveSpan(spanName, async span => {
      try {
        if (attrs && typeof attrs === 'object') {
          Object.entries(attrs).forEach(([k, v]) => {
            if (v != null) span.setAttribute(k, String(v));
          });
        }

        const result = await fn(span);
        span.setStatus({ code: api.SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Records a span for a cache lookup.
   *
   * @param {string}   endpoint
   * @param {boolean}  hit       Whether the cache was hit.
   * @param {Function} fn
   * @returns {Promise<*>}
   */
  async traceCache(endpoint, hit, fn) {
    return this.trace(`verteil.cache.${hit ? 'hit' : 'miss'}`, {
      'verteil.endpoint':  endpoint,
      'cache.hit':         hit,
    }, fn);
  }

  /**
   * Records a span for an HTTP request.
   *
   * @param {string}   endpoint
   * @param {string}   url
   * @param {Function} fn
   * @returns {Promise<*>}
   */
  async traceHttp(endpoint, url, fn) {
    return this.trace(`verteil.http.${endpoint}`, {
      'verteil.endpoint': endpoint,
      'http.url':         url,
      'http.method':      'POST',
    }, fn);
  }

  /**
   * Records a span for response parsing.
   *
   * @param {string}   endpoint
   * @param {Function} fn
   * @returns {Promise<*>}
   */
  async traceParse(endpoint, fn) {
    return this.trace(`verteil.parse.${endpoint}`, {
      'verteil.endpoint': endpoint,
    }, fn);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  async _getTracer() {
    if (this._tracer !== null) return this._tracer;

    const api = await loadOtel();
    if (!api) {
      this._tracer = false;
      return false;
    }

    this._tracer = api.trace.getTracer(this._serviceName);
    return this._tracer;
  }
}

export default VerteilTracer;
