/**
 * @fileoverview OpenAPI 3.1 specification generator for the Verteil NDC wrapper.
 *
 * Generates a complete OpenAPI 3.1 spec object describing all 11 endpoints,
 * their request/response shapes, and authentication scheme.
 *
 * @example
 * import { generateSpec, generateSpecJson } from './src/openapi/spec.js';
 *
 * // Get as JS object
 * const spec = generateSpec({ serverUrl: 'https://api.verteil.com' });
 *
 * // Get as formatted JSON string
 * const json = generateSpecJson({ serverUrl: 'https://api.verteil.com' });
 *
 * // Serve via Express
 * app.get('/openapi.json', (req, res) => res.json(generateSpec()));
 */

const VERSION = '1.0.0';

/**
 * Generates the OpenAPI 3.1 specification object.
 *
 * @param {Object} [options]
 * @param {string} [options.serverUrl='https://api.verteil.com']
 * @param {string} [options.title='Verteil NDC API Wrapper']
 * @param {string} [options.version=VERSION]
 * @returns {Object} OpenAPI 3.1 spec object.
 */
function generateSpec(options = {}) {
  const serverUrl = options.serverUrl ?? 'https://api.verteil.com';
  const title     = options.title     ?? 'Verteil NDC API Wrapper';
  const version   = options.version   ?? VERSION;

  return {
    openapi: '3.1.0',
    info: {
      title,
      version,
      description: 'Node.js wrapper for the Verteil NDC API — airline shopping, pricing, and order management.',
      contact:     { name: 'Verteil Support', url: 'https://verteil.com' },
      license:     { name: 'MIT' },
    },
    servers: [{ url: serverUrl, description: 'Verteil NDC API' }],
    security: [{ BearerAuth: [] }],
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: _buildSchemas(),
    },
    paths: _buildPaths(),
    tags: [
      { name: 'Shopping',   description: 'Flight search and pricing' },
      { name: 'Orders',     description: 'Order lifecycle management' },
      { name: 'Ancillaries', description: 'Seats and services' },
    ],
  };
}

/**
 * @param {Object} [options]
 * @returns {string} Pretty-printed JSON.
 */
function generateSpecJson(options = {}) {
  return JSON.stringify(generateSpec(options), null, 2);
}

// ── Private builders ─────────────────────────────────────────────────────────

function _buildSchemas() {
  const OriginDestination = {
    type: 'object',
    required: ['departureAirport', 'arrivalAirport', 'departureDate'],
    properties: {
      departureAirport: { type: 'string', pattern: '^[A-Z]{3}$', example: 'DEL' },
      arrivalAirport:   { type: 'string', pattern: '^[A-Z]{3}$', example: 'DXB' },
      departureDate:    { type: 'string', format: 'date', example: '2025-12-01' },
      arrivalDate:      { type: 'string', format: 'date' },
    },
  };

  const Traveler = {
    type: 'object',
    required: ['passengerType'],
    properties: {
      passengerType: { type: 'string', enum: ['ADT', 'CHD', 'INF'], example: 'ADT' },
      count:         { type: 'integer', minimum: 1, example: 1 },
    },
  };

  const PaymentCard = {
    type: 'object',
    required: ['number', 'cvv', 'expiry', 'holderName'],
    properties: {
      number:     { type: 'string', example: '4111111111111111' },
      cvv:        { type: 'string', example: '123' },
      expiry:     { type: 'string', example: '1227' },
      holderName: { type: 'string', example: 'John Doe' },
      brand:      { type: 'string', enum: ['VI', 'CA', 'AX', 'DC', 'DS'], example: 'VI' },
    },
  };

  const ErrorResponse = {
    type: 'object',
    properties: {
      Errors: {
        type: 'object',
        properties: {
          Error: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                value:  { type: 'string' },
                Code:   { type: 'string' },
                Owner:  { type: 'string' },
                ShortText: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };

  return { OriginDestination, Traveler, PaymentCard, ErrorResponse };
}

function _buildPaths() {
  return {
    '/entrygate/rest/request:airShopping': _endpointPath({
      tag:         'Shopping',
      operationId: 'airShopping',
      summary:     'Search for available flights',
      requestDesc: 'AirShopping request parameters',
      requestExample: {
        coreQuery: {
          originDestinations: [{ departureAirport: 'DEL', arrivalAirport: 'DXB', departureDate: '2025-12-01' }],
        },
        travelers:  [{ passengerType: 'ADT', count: 1 }],
        preference: { cabin: 'Y' },
      },
    }),

    '/entrygate/rest/request:flightPrice': _endpointPath({
      tag:         'Shopping',
      operationId: 'flightPrice',
      summary:     'Price a selected offer',
      requestDesc: 'FlightPrice request parameters',
      requestExample: {
        query: {
          originDestinations: [],
          offers: [{ owner: 'EK', offerId: 'OFFER-001', offerItems: [{ id: 'ITEM-001' }] }],
        },
        travelers: [{ objectKey: 'T1', passengerType: 'ADT' }],
      },
    }),

    '/entrygate/rest/request:orderCreate': _endpointPath({
      tag:         'Orders',
      operationId: 'orderCreate',
      summary:     'Create a new order (book a flight)',
      requestDesc: 'OrderCreate request parameters',
      requestExample: {
        query:      { orderItems: [] },
        passengers: [{ objectKey: 'T1', passengerType: 'ADT', name: { given: 'John', surname: 'Doe' } }],
        payments:   [{ type: 'card', card: { number: '4111...', cvv: '123', expiry: '1227', holderName: 'John Doe' } }],
      },
    }),

    '/entrygate/rest/request:orderRetrieve': _endpointPath({
      tag:         'Orders',
      operationId: 'orderRetrieve',
      summary:     'Retrieve an existing order by PNR',
      requestDesc: 'OrderRetrieve parameters',
      requestExample: { owner: 'EK', orderId: 'ABC123', channel: 'NDC' },
    }),

    '/entrygate/rest/request:orderCancel': _endpointPath({
      tag:         'Orders',
      operationId: 'orderCancel',
      summary:     'Cancel one or more orders',
      requestDesc: 'OrderCancel parameters',
      requestExample: { orders: [{ owner: 'EK', orderId: 'ABC123' }] },
    }),

    '/entrygate/rest/request:orderChange': _endpointPath({
      tag:         'Orders',
      operationId: 'orderChange',
      summary:     'Apply changes to an existing order',
      requestDesc: 'OrderChange parameters',
      requestExample: {
        orderId: { owner: 'EK', orderId: 'ABC123' },
        changes: [{ type: 'PASSENGER_INFO', passengerRef: 'T1', updates: {} }],
      },
    }),

    '/entrygate/rest/request:orderReshop': _endpointPath({
      tag:         'Orders',
      operationId: 'orderReshop',
      summary:     'Re-shop an existing order for alternative pricing',
      requestDesc: 'OrderReshop parameters',
      requestExample: { owner: 'EK', orderId: 'ABC123' },
    }),

    '/entrygate/rest/request:itinReshop': _endpointPath({
      tag:         'Orders',
      operationId: 'itinReshop',
      summary:     'Re-shop itinerary at segment / date level',
      requestDesc: 'ItinReshop parameters',
      requestExample: {
        orderId: 'ABC123',
        owner:   'EK',
        changes: [{ type: 'DATE_CHANGE', segmentRef: 'SEG001', newDate: '2025-12-05' }],
      },
    }),

    '/entrygate/rest/request:orderChangeNotif': _endpointPath({
      tag:         'Orders',
      operationId: 'orderChangeNotif',
      summary:     'Send a schedule-change notification',
      requestDesc: 'OrderChangeNotif parameters',
      requestExample: { orderId: 'ABC123', owner: 'EK', notifType: 'SCHEDULE_CHANGE' },
    }),

    '/entrygate/rest/request:preSeatAvailability': _endpointPath({
      tag:         'Ancillaries',
      operationId: 'seatAvailabilityPre',
      summary:     'Get seat map for pre-booking seat selection',
      requestDesc: 'Pre-booking SeatAvailability parameters',
      requestExample: { type: 'pre', query: { originDestinations: [], offers: [] } },
    }),

    '/entrygate/rest/request:postSeatAvailability': _endpointPath({
      tag:         'Ancillaries',
      operationId: 'seatAvailabilityPost',
      summary:     'Get seat map for an existing order',
      requestDesc: 'Post-booking SeatAvailability parameters',
      requestExample: { type: 'post', orderId: 'ABC123', owner: 'EK' },
    }),

    '/entrygate/rest/request:preServiceList': _endpointPath({
      tag:         'Ancillaries',
      operationId: 'serviceListPre',
      summary:     'List ancillary services for pre-booking context',
      requestDesc: 'Pre-booking ServiceList parameters',
      requestExample: { type: 'pre' },
    }),

    '/entrygate/rest/request:postServiceList': _endpointPath({
      tag:         'Ancillaries',
      operationId: 'serviceListPost',
      summary:     'List ancillary services for an existing order',
      requestDesc: 'Post-booking ServiceList parameters',
      requestExample: { type: 'post', orderId: 'ABC123', owner: 'EK' },
    }),
  };
}

function _endpointPath({ tag, operationId, summary, requestDesc, requestExample }) {
  return {
    post: {
      tags:        [tag],
      operationId,
      summary,
      security:    [{ BearerAuth: [] }],
      parameters: [
        { name: 'ThirdpartyId', in: 'header', schema: { type: 'string' }, description: 'Third-party agent identifier' },
        { name: 'OfficeId',     in: 'header', schema: { type: 'string' }, description: 'Office / GDS identifier' },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema:  { type: 'object', description: requestDesc },
            example: requestExample,
          },
        },
      },
      responses: {
        200: {
          description: 'Successful NDC response',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        400: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        401: {
          description: 'Authentication failed',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        429: { description: 'Rate limit exceeded' },
        500: { description: 'Internal server error' },
      },
    },
  };
}

export { generateSpec, generateSpecJson };
export default generateSpec;
