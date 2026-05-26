/**
 * @fileoverview Mock/sandbox adapter for the Verteil NDC wrapper.
 *
 * `VerteilMockClient` extends `VerteilClient` and intercepts `_makeRequest`,
 * returning fixture JSON from `./fixtures/` instead of hitting the real API.
 *
 * Useful for:
 *  - Integration tests that must not incur real API calls or costs.
 *  - Local development without Verteil sandbox credentials.
 *  - CI pipelines.
 *
 * @example
 * import VerteilMockClient from './src/mock/VerteilMockClient.js';
 *
 * const client = new VerteilMockClient();
 * const result = await client.airShopping({ ... });
 * // Returns fixture data from fixtures/airShopping.json
 *
 * // Register a one-time override:
 * client.mockOnce('flightPrice', { Errors: { Error: [{ value: 'Sold out' }] } });
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath }            from 'url';
import path                         from 'path';
import VerteilClient                from '../VerteilClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

/**
 * @class VerteilMockClient
 * @extends VerteilClient
 */
class VerteilMockClient extends VerteilClient {
  /**
   * @param {Object} [config={}]   Passed through to VerteilClient (credentials optional).
   * @param {Object} [fixtures={}] Map of endpointName → response to return instead of files.
   */
  constructor(config = {}, fixtures = {}) {
    super({
      username: 'mock-user',
      password: 'mock-pass',
      baseUrl:  'http://mock.verteil.local',
      ...config,
    });

    /** @private @type {Object.<string, *>} */
    this._fixtures = { ...fixtures };

    /** @private @type {Array<{endpoint: string, response: *}>} */
    this._oneTimeOverrides = [];

    /** @private @type {Array<{endpoint: string, params: *, response: *}>} */
    this._callLog = [];
  }

  /**
   * Registers a response that is returned only for the NEXT call to `endpoint`.
   * Subsequent calls fall back to the default fixture.
   *
   * @param {string} endpoint
   * @param {*}      response
   * @returns {this}
   */
  mockOnce(endpoint, response) {
    this._oneTimeOverrides.push({ endpoint, response });
    return this;
  }

  /**
   * Registers a persistent fixture override for an endpoint.
   *
   * @param {string} endpoint
   * @param {*}      response
   * @returns {this}
   */
  mockAlways(endpoint, response) {
    this._fixtures[endpoint] = response;
    return this;
  }

  /**
   * Clears all registered overrides and call log.
   *
   * @returns {this}
   */
  reset() {
    this._fixtures        = {};
    this._oneTimeOverrides = [];
    this._callLog         = [];
    return this;
  }

  /**
   * Returns all recorded calls (endpoint + params pairs).
   *
   * @returns {Array<{endpoint: string, params: *, calledAt: string}>}
   */
  getCallLog() {
    return [...this._callLog];
  }

  /**
   * Returns the number of calls made to a specific endpoint.
   *
   * @param {string} endpoint
   * @returns {number}
   */
  callCount(endpoint) {
    return this._callLog.filter(c => c.endpoint === endpoint).length;
  }

  // ── Override _makeRequest ─────────────────────────────────────────────────

  /**
   * Intercepts every outbound API call and returns mock data instead.
   *
   * Response resolution priority (highest to lowest):
   *   1. One-time override registered via mockOnce()  — consumed on first match
   *   2. Persistent override registered via mockAlways()
   *   3. Fixture file in fixtures/<endpoint>.json (or .js)
   *   4. Built-in default stub from _defaultStub()
   *
   * All calls are recorded in _callLog regardless of which response source is used,
   * so tests can assert on call count and parameters without running any assertions
   * inside the response handler.
   *
   * @override
   * @private
   */
  async _makeRequest(endpoint, params) {
    // Record every call for inspection via getCallLog() / callCount().
    this._callLog.push({ endpoint, params, calledAt: new Date().toISOString() });

    // One-time overrides are searched by endpoint name.  findIndex + splice ensures
    // the override is consumed exactly once (like Jest's mockImplementationOnce).
    const oneTimeIdx = this._oneTimeOverrides.findIndex(o => o.endpoint === endpoint);
    if (oneTimeIdx !== -1) {
      // splice(idx, 1) removes the entry and returns [entry]; destructure to get the item.
      const [override] = this._oneTimeOverrides.splice(oneTimeIdx, 1);
      return override.response;
    }

    // Persistent overrides set via mockAlways() stay until reset() is called.
    if (this._fixtures[endpoint] !== undefined) {
      return this._fixtures[endpoint];
    }

    // Fall back to the fixture file or the built-in stub.
    return this._loadFixture(endpoint);
  }

  /** @override */
  async authenticate() {
    this._token = 'mock-bearer-token';
    return this;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  _loadFixture(endpoint) {
    const candidates = [
      path.join(FIXTURES_DIR, `${endpoint}.json`),
      path.join(FIXTURES_DIR, `${endpoint}.js`),
    ];

    for (const filePath of candidates) {
      if (existsSync(filePath)) {
        if (filePath.endsWith('.json')) {
          return JSON.parse(readFileSync(filePath, 'utf8'));
        }
        // .js fixtures can export dynamic data
        return import(filePath).then(m => (typeof m.default === 'function' ? m.default() : m.default));
      }
    }

    // Return minimal valid-looking stub if no fixture file exists
    return this._defaultStub(endpoint);
  }

  /** @private */
  _defaultStub(endpoint) {
    const stubs = {
      airShopping:      { AirShoppingRS: { OffersGroup: { AirlineOffers: [] }, ShoppingResponseID: { ResponseID: { value: 'MOCK-SHOP-001' } } } },
      flightPrice:      { FlightPriceRS: { PricedOffer: {} } },
      orderCreate:      { OrderViewRS:   { Order: { OrderID: { value: 'MOCK-ORD-001', Owner: 'EK' } } } },
      orderRetrieve:    { OrderViewRS:   { Order: { OrderID: { value: 'MOCK-ORD-001', Owner: 'EK' } } } },
      orderCancel:      { OrderCancelRS: { OrderID: { value: 'MOCK-ORD-001', Owner: 'EK' } } },
      orderChange:      { OrderChangeRS: {} },
      orderReshop:      { OrderReshopRS: { Offer: {} } },
      itinReshop:       { ItinReshopRS:  { Offer: {} } },
      orderChangeNotif: { OrderChangeNotifRS: {} },
      seatAvailability: { SeatAvailabilityRS: { DataLists: { SeatList: { Seats: [] } } } },
      serviceList:      { ServiceListRS: { Services: { Service: [] } } },
    };
    return stubs[endpoint] ?? { mock: true, endpoint };
  }
}

export default VerteilMockClient;
