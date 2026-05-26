/**
 * @fileoverview Core Verteil NDC API client.
 *
 * Orchestrates authentication (OAuth2 client-credentials), request building,
 * caching, rate limiting, exponential-backoff retry, structured logging, and
 * response parsing for all supported Verteil NDC endpoints.
 *
 * @example
 * import { VerteilClient } from '@verteil/cnv-js';
 *
 * const client = new VerteilClient({
 *   username: 'acme',
 *   password: 's3cr3t',
 *   baseUrl:  'https://api.verteil.com',
 * });
 *
 * const results = await client.airShopping({ ... });
 */

import https from 'https';
import axios from 'axios';

import VerteilCache            from './cache/VerteilCache.js';
import VerteilApiException     from './exceptions/VerteilApiException.js';
import VerteilLogger           from './logging/VerteilLogger.js';
import RateLimiter             from './rateLimit/RateLimiter.js';
import RequestHelper           from './requests/RequestHelper.js';
import RetryHandler            from './retry/RetryHandler.js';
import SecureTokenStorage      from './security/SecureTokenStorage.js';
import { sanitize }            from './security/sanitizeInput.js';

import AirShoppingRequest      from './requests/AirShoppingRequest.js';
import FlightPriceRequest      from './requests/FlightPriceRequest.js';
import OrderCreateRequest      from './requests/OrderCreateRequest.js';
import OrderRetrieveRequest    from './requests/OrderRetrieveRequest.js';
import OrderCancelRequest      from './requests/OrderCancelRequest.js';
import OrderChangeRequest      from './requests/OrderChangeRequest.js';
import OrderReshopRequest      from './requests/OrderReshopRequest.js';
import ItinReshopRequest       from './requests/ItinReshopRequest.js';
import OrderChangeNotifRequest from './requests/OrderChangeNotifRequest.js';
import SeatAvailabilityRequest from './requests/SeatAvailabilityRequest.js';
import ServiceListRequest      from './requests/ServiceListRequest.js';

import AirShoppingResponse      from './responses/AirShoppingResponse.js';
import FlightPriceResponse      from './responses/FlightPriceResponse.js';
import ItinReshopResponse       from './responses/ItinReshopResponse.js';
import OrderChangeNotifResponse from './responses/OrderChangeNotifResponse.js';
import OrderChangeResponse      from './responses/OrderChangeResponse.js';
import OrderReshopResponse      from './responses/OrderReshopResponse.js';
import OrderViewResponse        from './responses/OrderViewResponse.js';
import SeatAvailabilityResponse from './responses/SeatAvailabilityResponse.js';
import ServiceListResponse      from './responses/ServiceListResponse.js';

import defaults from './config/defaults.js';
import CircuitBreaker from './circuitBreaker/CircuitBreaker.js';

const REQUEST_CLASSES = {
  airShopping:      AirShoppingRequest,
  flightPrice:      FlightPriceRequest,
  orderCreate:      OrderCreateRequest,
  orderRetrieve:    OrderRetrieveRequest,
  orderCancel:      OrderCancelRequest,
  orderChange:      OrderChangeRequest,
  orderReshop:      OrderReshopRequest,
  itinReshop:       ItinReshopRequest,
  orderChangeNotif: OrderChangeNotifRequest,
  seatAvailability: SeatAvailabilityRequest,
  serviceList:      ServiceListRequest,
};

/**
 * @class VerteilClient
 * @description Full-featured Verteil NDC API client with built-in caching,
 * rate limiting, retry, and structured logging.
 */
class VerteilClient {
  /**
   * @param {import('./config/defaults').VerteilConfig} [config={}]
   *   Partial configuration merged with {@link defaults}.
   */
  constructor(config = {}) {
    /** @type {import('./config/defaults').VerteilConfig} */
    this._config = { ...defaults, ...config };

    /** @type {string|null} */
    this._token = null;

    /** @type {SecureTokenStorage} */
    this._tokenStorage = new SecureTokenStorage();

    /** @type {VerteilCache} */
    this._cache = config.cache ?? new VerteilCache();

    /** @type {RateLimiter} */
    this._rateLimiter = config.rateLimiter ?? new RateLimiter();

    /** @type {RetryHandler} */
    this._retryHandler = new RetryHandler();

    /** @type {VerteilLogger} */
    this._logger = new VerteilLogger();

    /** @type {CircuitBreaker} */
    this._circuitBreaker = config.circuitBreaker ?? new CircuitBreaker({
      onStateChange: (ep, from, to) => {
        this._logger.logRequest(ep, { event: 'circuit_state_change', from, to });
        this._metrics?.recordCircuitState(ep, to);
      },
    });

    /** @type {import('./metrics/VerteilMetrics.js').default|null} */
    this._metrics = config.metrics ?? null;

    /** @type {import('./tracing/VerteilTracer.js').default|null} */
    this._tracer = config.tracer ?? null;

    /** @type {import('./queue/DeadLetterQueue.js').default|null} */
    this._dlq = config.deadLetterQueue ?? null;

    this._initAxios();
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  /** @private */
  _initAxios() {
    const poolConfig = this._config.connectionPool ?? {};
    const agentOptions = {
      keepAlive:      poolConfig.keepAlive      ?? true,
      keepAliveMsecs: poolConfig.keepAliveMsecs ?? 30_000,
      maxSockets:     poolConfig.maxSockets     ?? 50,
      maxFreeSockets: poolConfig.maxFreeSockets ?? 10,
    };

    const httpsAgent = this._config.verifySsl === false
      ? new https.Agent({ ...agentOptions, rejectUnauthorized: false })
      : new https.Agent(agentOptions);

    /** @type {import('axios').AxiosInstance} */
    this._http = axios.create({
      baseURL:    this._config.baseUrl,
      timeout:    this._config.timeout,
      headers: {
        Accept:           'application/json',
        'Content-Type':   'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      httpsAgent,
      decompress: true,
    });
  }

  /**
   * Attaches optional plugin dependencies after construction.
   *
   * @param {Object} plugins
   * @param {import('./metrics/VerteilMetrics.js').default} [plugins.metrics]
   * @param {import('./tracing/VerteilTracer.js').default}  [plugins.tracer]
   * @param {import('./queue/DeadLetterQueue.js').default}  [plugins.deadLetterQueue]
   * @returns {this}
   */
  use(plugins = {}) {
    if (plugins.metrics)       this._metrics = plugins.metrics;
    if (plugins.tracer)        this._tracer  = plugins.tracer;
    if (plugins.deadLetterQueue) this._dlq   = plugins.deadLetterQueue;
    return this;
  }

  /**
   * Attaches a dead-letter queue to capture unrecoverable failures.
   *
   * @param {import('./queue/DeadLetterQueue.js').default} dlq
   * @returns {this}
   */
  setDeadLetterQueue(dlq) {
    this._dlq = dlq;
    return this;
  }

  // ── Authentication ─────────────────────────────────────────────────────────

  /**
   * Authenticates against the Verteil OAuth2 token endpoint.
   * Reuses a cached token when one is still valid.
   *
   * @returns {Promise<this>}
   * @throws {VerteilApiException} On authentication failure.
   */
  async authenticate() {
    if (this._tokenStorage.hasValidToken()) {
      this._token = this._tokenStorage.retrieveToken();
      return this;
    }

    try {
      const response = await this._http.post('/oauth2/token', null, {
        auth: {
          username: this._config.username,
          password: this._config.password,
        },
        params: {
          grant_type: 'client_credentials',
          scope:      'api',
        },
      });

      this._token = response.data.access_token;
      this._tokenStorage.storeToken(this._token);
      return this;
    } catch (err) {
      this._logger.logError('authenticate', err);
      throw new VerteilApiException(
        `Authentication failed: ${err.message}`,
        err.response?.status ?? 0,
        err,
      );
    }
  }

  /**
   * Ensures the outgoing axios instance carries a valid Bearer token header.
   * Calls {@link authenticate} automatically when no token is present.
   *
   * @returns {Promise<void>}
   */
  async _setAuthorizationHeader() {
    if (!this._token) await this.authenticate();

    this._http.defaults.headers.common.Authorization = `Bearer ${this._token}`;
  }

  // ── Public API surface ─────────────────────────────────────────────────────

  /**
   * Executes an AirShopping request and returns the normalised response array.
   *
   * @param {Object} params - AirShopping request parameters.
   * @returns {Promise<Object>}
   */
  async airShopping(params) {
    const raw = await this._makeRequest('airShopping', params);
    return new AirShoppingResponse(raw).toArray();
  }

  /**
   * Executes a FlightPrice request and returns the normalised response array.
   *
   * @param {Object} params - FlightPrice request parameters.
   * @returns {Promise<Object>}
   */
  async flightPrice(params) {
    const raw = await this._makeRequest('flightPrice', params);
    return new FlightPriceResponse(raw).toArray();
  }

  /**
   * Creates a new order and returns the normalised OrderView response.
   *
   * @param {Object} params - OrderCreate request parameters.
   * @returns {Promise<Object>}
   */
  async createOrder(params) {
    const raw = await this._makeRequest('orderCreate', params);
    return new OrderViewResponse(raw).toArray();
  }

  /**
   * Retrieves an existing order by ID.
   *
   * @param {Object} params - OrderRetrieve request parameters.
   * @returns {Promise<Object>}
   */
  async retrieveOrder(params) {
    const raw = await this._makeRequest('orderRetrieve', params);
    return new OrderViewResponse(raw).toArray();
  }

  /**
   * Cancels one or more orders.
   *
   * @param {Object} params - OrderCancel request parameters.
   * @returns {Promise<Object>} Raw cancellation response.
   */
  async cancelOrder(params) {
    return this._makeRequest('orderCancel', params);
  }

  /**
   * Retrieves seat availability for a flight or existing order.
   *
   * @param {Object} params - SeatAvailability request parameters.
   * @returns {Promise<SeatAvailabilityResponse>}
   */
  async getSeatAvailability(params) {
    const raw = await this._makeRequest('seatAvailability', params);
    return new SeatAvailabilityResponse(raw);
  }

  /**
   * Retrieves the list of ancillary services for a shopping context or order.
   * Set `params.type = 'post'` for post-booking queries (requires orderId).
   * Defaults to `'pre'` (pre-booking, requires offer context).
   *
   * @param {Object} params - ServiceList request parameters (includes `type` field).
   * @returns {Promise<ServiceListResponse>}
   */
  async getServiceList(params) {
    const raw = await this._makeRequest('serviceList', params);
    return new ServiceListResponse(raw);
  }

  /**
   * Applies changes to an existing order.
   *
   * @param {Object} params - OrderChange request parameters.
   * @returns {Promise<OrderChangeResponse>}
   */
  async changeOrder(params) {
    const raw = await this._makeRequest('orderChange', params);
    return new OrderChangeResponse(raw);
  }

  /**
   * Re-shops an existing order for alternative pricing or routing.
   *
   * @param {Object} params - OrderReshop request parameters.
   * @returns {Promise<OrderReshopResponse>}
   */
  async reshopOrder(params) {
    const raw = await this._makeRequest('orderReshop', params);
    return new OrderReshopResponse(raw);
  }

  /**
   * Re-shops an existing order at itinerary level (segment / date changes).
   *
   * @param {Object} params - ItinReshop request parameters.
   * @returns {Promise<ItinReshopResponse>}
   */
  async reshopItinerary(params) {
    const raw = await this._makeRequest('itinReshop', params);
    return new ItinReshopResponse(raw);
  }

  /**
   * Sends an order-change notification (schedule change, flight cancel, etc.).
   *
   * @param {Object} params - OrderChangeNotif request parameters.
   * @returns {Promise<OrderChangeNotifResponse>}
   */
  async sendOrderChangeNotification(params) {
    const raw = await this._makeRequest('orderChangeNotif', params);
    return new OrderChangeNotifResponse(raw);
  }

  // ── Streaming ──────────────────────────────────────────────────────────────

  /**
   * Streams AirShopping results as an AsyncGenerator, yielding one airline's
   * offers at a time.  Allows callers to process large responses incrementally
   * rather than buffering the entire payload.
   *
   * @param {Object} params - AirShopping request parameters.
   * @yields {Object} One AirlineOffer group per iteration.
   */
  async * streamAirShopping(params) {
    const raw      = await this._makeRequest('airShopping', params);
    const response = new AirShoppingResponse(raw);
    const offers   = response.data?.AirShoppingRS?.OffersGroup?.AirlineOffers?.AirlineOffer
      ?? response.data?.OffersGroup?.AirlineOffers
      ?? [];

    // Yield one airline group at a time, interleaving with the event loop
    for (const group of [offers].flat()) {
      yield group;
      await new Promise(r => setImmediate(r));
    }
  }

  // ── New endpoint helpers ────────────────────────────────────────────────────

  /**
   * Previews cancellation fees and expected refund without committing.
   * Calls `orderCancel` in dry-run mode (sets `previewOnly: true` flag).
   *
   * @param {Object} params - Same shape as `cancelOrder` params.
   * @returns {Promise<{orderId: string, owner: string, refundAmount?: Object, penalties?: Array}>}
   */
  async previewCancellation(params) {
    const raw = await this._makeRequest('orderCancel', { ...params, previewOnly: true });
    return {
      orderId:      params.orders?.[0]?.orderId,
      owner:        params.orders?.[0]?.owner,
      refundAmount: raw?.ExpectedRefundAmount ?? raw?.OrderCancelRS?.ExpectedRefundAmount ?? null,
      penalties:    raw?.Penalties            ?? raw?.OrderCancelRS?.Penalties            ?? [],
      conditions:   raw?.Conditions           ?? raw?.OrderCancelRS?.Conditions           ?? [],
      raw,
    };
  }

  /**
   * Retrieves fare rules for a specific offer and fare-basis code.
   *
   * @param {string} offerId       Offer ID from a FlightPrice or AirShopping response.
   * @param {string} fareBasisCode Fare basis code (e.g. 'YLOWUS').
   * @param {string} [owner]       Airline owner code.
   * @returns {Promise<Object>} Raw fare-rules response.
   */
  async getFareRules(offerId, fareBasisCode, owner) {
    return this._makeRequest('fareRules', { offerId, fareBasisCode, owner });
  }

  /**
   * Pre-warms the cache by firing a batch of requests in the background.
   * Useful at application startup to ensure the first real user requests
   * receive cached responses.
   *
   * @param {Array<{endpoint: string, params: Object}>} routes - Endpoint + params pairs to warm.
   * @returns {Promise<{warmed: number, failed: number}>}
   */
  async prewarm(routes) {
    let warmed = 0;
    let failed = 0;

    await Promise.allSettled(
      (routes ?? []).map(async ({ endpoint, params }) => {
        try {
          await this._makeRequest(endpoint, params);
          warmed++;
        } catch {
          failed++;
        }
      }),
    );

    return { warmed, failed };
  }

  // ── Cache helpers ──────────────────────────────────────────────────────────

  /**
   * Flushes all cached responses, or only those for a specific endpoint.
   *
   * @param {string} [endpoint] - If supplied, only that endpoint's cache is cleared.
   */
  flushCache(endpoint) {
    this._cache.clear(endpoint);
  }

  /**
   * Returns the underlying {@link VerteilCache} instance for advanced control.
   *
   * @returns {VerteilCache}
   */
  getCache() {
    return this._cache;
  }

  // ── Core request pipeline ──────────────────────────────────────────────────

  /**
   * Central request dispatcher: cache → rate-limit → retry → HTTP → cache-store.
   *
   * Pipeline order (each step is a guard that can short-circuit the chain):
   *   1. Metrics timer start
   *   2. Cache lookup  — return early if hit (no network, no rate-limit consumed)
   *   3. Rate limiter  — reject immediately if window is exhausted
   *   4. Circuit breaker — reject immediately if the endpoint is OPEN
   *   5. Retry loop    — re-executes the inner function on transient failures
   *   6. Auth          — attach Bearer token (re-authenticate if missing)
   *   7. Request build — sanitise params, pick the correct Request class
   *   8. HTTP POST     — send to Verteil, handle 401 with a single re-auth
   *   9. Cache store   — persist successful responses for future hits
   *  10. Error path    — DLQ push for unrecoverable failures
   *
   * @private
   * @param {string} endpoint - Logical endpoint name (e.g. 'airShopping').
   * @param {Object} params   - Raw caller parameters.
   * @returns {Promise<Object>} Parsed JSON response body.
   * @throws {VerteilApiException}
   */
  async _makeRequest(endpoint, params) {
    // Start a Prometheus histogram observation.  stopTimer() is called at every
    // exit path (hit, miss, error) to ensure latency is always recorded.
    const stopTimer = this._metrics?.startTimer(endpoint);

    try {
      // ── Step 1: Cache lookup ─────────────────────────────────────────────
      // We wrap get() in Promise.resolve() so the same code path works for both
      // the synchronous in-memory VerteilCache and the async RedisCache adapter.
      // A cache hit skips rate-limiting entirely — the counter is only decremented
      // when a real API call goes out.
      const cached = await Promise.resolve(this._cache.get(endpoint, params));
      if (cached) {
        this._logger.logRequest(endpoint, { cached: true, stage: 'cache_hit' });
        this._metrics?.recordCacheHit(endpoint);
        this._metrics?.recordRequest(endpoint, 200);
        stopTimer?.();
        return cached;
      }
      this._metrics?.recordCacheMiss(endpoint);

      // ── Step 2: Rate limiting ────────────────────────────────────────────
      // attempt() increments the sliding-window counter and returns false when the
      // limit is exhausted.  retryAfter() tells the caller how long to wait.
      // Same Promise.resolve() trick — works with both RateLimiter (sync) and
      // RedisRateLimiter (async/Promise).
      const allowed = await Promise.resolve(this._rateLimiter.attempt(endpoint));
      if (!allowed) {
        const retryAfter = await Promise.resolve(this._rateLimiter.retryAfter(endpoint));
        throw new VerteilApiException(`Rate limit exceeded. Retry in ${retryAfter}s.`, 429);
      }

      // ── Steps 3 + 4: Circuit breaker wraps the retry loop ───────────────
      // The outer layer is the circuit breaker, not the retry handler.
      // This means: if the circuit is OPEN, we fail fast BEFORE attempting any
      // retries.  If the circuit is CLOSED, the retry handler may attempt
      // multiple HTTP calls; each failure is recorded by the circuit breaker's
      // _onFailure hook.  Once failures exceed the threshold, subsequent calls
      // to execute() throw immediately (no retries, no HTTP calls).
      return await this._circuitBreaker.execute(endpoint, async () => {
        return await this._retryHandler.execute(async () => {
          this._logger.logRequest(endpoint, { raw_params: params, stage: 'initial' });

          // ── Step 5: Input sanitisation ─────────────────────────────────
          // Strip HTML tags, encode entities, remove null bytes from all string
          // values in params before they reach the NDC request builders.
          const sanitizedParams = sanitize(params);

          // ── Step 6: Auth ───────────────────────────────────────────────
          // Ensures a valid Bearer token is attached to the axios instance.
          // If no token is cached, this triggers an OAuth2 client-credentials flow.
          await this._setAuthorizationHeader();

          // ── Step 7: Request construction ───────────────────────────────
          // REQUEST_CLASSES maps endpoint names to their concrete Request class.
          // Using a static map (rather than dynamic require/import) avoids
          // asynchronous module loading inside the hot request path.
          const RequestClass = REQUEST_CLASSES[endpoint];
          if (!RequestClass) throw new VerteilApiException(`Unknown endpoint: ${endpoint}`, 400);

          // RequestHelper.transformParameters converts our simplified params shape
          // into the constructor arguments expected by each Request class.
          const constructorArgs = RequestHelper.transformParameters(endpoint, sanitizedParams);
          const request = new RequestClass(...constructorArgs);

          // toArray() builds the final NDC-wire JSON body; getHeaders() returns
          // the per-request HTTP headers (e.g. ThirdPartyId, OfficeId).
          const finalBody = request.toArray();
          this._logger.logRequest(endpoint, {
            final_request: finalBody,
            stage:         'processed',
            headers:       request.getHeaders(),
          });

          // ── Step 8: HTTP call ──────────────────────────────────────────
          try {
            // Filter out null/undefined header values — axios would otherwise
            // serialise them as the string "null" which confuses Verteil's proxy.
            const response = await this._http.post(request.getEndpoint(), finalBody, {
              headers: Object.fromEntries(
                Object.entries(request.getHeaders()).filter(([, v]) => v != null),
              ),
            });

            const data = response.data;

            // ── Step 9: Cache store ──────────────────────────────────────
            // Only cacheable endpoints (airShopping, flightPrice, etc.) will
            // actually store anything — the cache impl silently ignores others.
            await Promise.resolve(this._cache.put(endpoint, params, data));
            this._logger.logResponse(endpoint, response.status, data);
            this._metrics?.recordRequest(endpoint, response.status);
            stopTimer?.();
            return data;

          } catch (httpErr) {
            // 401 means the token expired mid-session (e.g. server-side revocation).
            // We clear the stored token and recurse once — not inside the retry loop —
            // to get a fresh token before the next attempt.  Returning the recursive
            // call result exits the retry loop via normal return (no exception).
            if (httpErr.response?.status === 401) {
              this._tokenStorage.clearToken();
              this._token = null;
              return this._makeRequest(endpoint, params);
            }

            this._logger.logError(endpoint, httpErr);
            this._metrics?.recordRequest(endpoint, httpErr.response?.status ?? 0);
            this._metrics?.recordError(endpoint, String(httpErr.response?.status ?? 'network'));

            // When Verteil returns a structured error body, unwrap the first Error
            // message and wrap it in VerteilApiException so callers get a clean,
            // typed error instead of the raw axios error.
            if (httpErr.response?.data) {
              const errBody = httpErr.response.data;
              throw new VerteilApiException(
                errBody?.Errors?.Error?.[0]?.value ?? 'Unknown error',
                httpErr.response.status,
                httpErr,
                errBody,
              );
            }

            // No response body — re-throw the raw axios error for the retry
            // handler to decide whether to retry (e.g. ECONNRESET, 503).
            throw httpErr;
          }
        }, endpoint);  // endpoint label is used in retry log messages
      });  // circuit breaker execute()

    } catch (err) {
      stopTimer?.();
      this._logger.logError(endpoint, err, { raw_params: params, stage: 'request_initialization' });
      this._metrics?.recordError(endpoint, err.code ?? String(err.statusCode ?? 'unknown'));

      // ── Step 10: Dead-letter queue ───────────────────────────────────────
      // Push to DLQ only when the call truly failed (retries exhausted, circuit
      // breaker refused the call, etc.).  We exclude CIRCUIT_OPEN errors because
      // those are not real failures — the underlying request was never attempted,
      // and the caller should retry after the reset timeout.
      if (this._dlq && err.code !== 'CIRCUIT_OPEN') {
        // Non-fatal: if the DLQ itself is unavailable, swallow the error so we
        // don't mask the original failure from the caller.
        await this._dlq.push(endpoint, params, err).catch(() => { /* non-fatal */ });
      }

      throw err;
    }
  }

  /**
   * Maps a camelCase endpoint name to the PascalCase request-class filename prefix.
   *
   * @private
   * @param {string} endpoint - e.g. 'airShopping', 'preServiceList'
   * @returns {string} e.g. 'AirShopping', 'PreServiceList'
   */
  _endpointToClassName(endpoint) {
    return endpoint.charAt(0).toUpperCase() + endpoint.slice(1);
  }
}

export default VerteilClient;
