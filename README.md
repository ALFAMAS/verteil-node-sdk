# `verteil-node-sdk` — Verteil NDC API Client

A production-ready Node.js (ESM) client for the [Verteil NDC API](https://verteil.com).
Ships with OAuth2 auth, circuit-breaker, distributed rate limiting, in-memory and
Redis caching, exponential-backoff retry, OpenTelemetry tracing, Prometheus metrics,
HMAC-validated webhooks, TypeScript declarations, a CLI tool, and a zero-dependency
mock adapter for testing.

```
npm install verteil-node-sdk
```

---

## Table of Contents

1. [Requirements](#requirements)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Configuration Reference](#configuration-reference)
5. [Authentication](#authentication)
6. [API Methods](#api-methods)
   - [airShopping](#1-airshopping)
   - [flightPrice](#2-flightprice)
   - [createOrder](#3-createorder)
   - [retrieveOrder](#4-retrieveorder)
   - [cancelOrder](#5-cancelorder)
   - [changeOrder](#6-changeorder)
   - [reshopOrder](#7-reshoporder)
   - [reshopItinerary](#8-reshopitinerary)
   - [sendOrderChangeNotification](#9-sendorderchangenotification)
   - [getSeatAvailability](#10-getseatavailability)
   - [getServiceList](#11-getservicelist)
7. [Streaming](#streaming)
8. [DataType Builders](#datatype-builders)
9. [Response Objects](#response-objects)
10. [Caching](#caching)
11. [Rate Limiting](#rate-limiting)
12. [Circuit Breaker](#circuit-breaker)
13. [Retry & Backoff](#retry--backoff)
14. [Logging](#logging)
15. [Security](#security)
16. [Health Monitoring](#health-monitoring)
17. [Metrics](#metrics)
18. [Tracing](#tracing)
19. [Webhooks](#webhooks)
20. [Helpers](#helpers)
    - [ItineraryBuilder](#itinerarybuilder)
    - [CurrencyNormalizer](#currencynormalizer)
    - [LoyaltyAggregator](#loyaltyaggregator)
21. [Dead-Letter Queue](#dead-letter-queue)
22. [Validation](#validation)
23. [OpenAPI Spec](#openapi-spec)
24. [Mock Client](#mock-client)
25. [TypeScript Support](#typescript-support)
26. [CLI Tool](#cli-tool)
27. [Error Handling](#error-handling)
28. [Production Checklist](#production-checklist)

---

## Requirements

| Requirement | Version |
|---|---|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 8 |

**Peer dependencies (all optional):**

| Package | Feature enabled |
|---|---|
| `ioredis` ≥ 5 | Redis cache + distributed rate limiting + dead-letter queue |
| `@opentelemetry/api` ≥ 1 | Distributed tracing |
| `prom-client` ≥ 14 | Prometheus metrics |

The library works without any of these. Relevant features silently degrade to
no-ops when the peer dependency is absent.

---

## Installation

```bash
npm install verteil-node-sdk

# Optional — install only the peer deps you need
npm install ioredis
npm install @opentelemetry/api
npm install prom-client
```

---

## Quick Start

```js
import { VerteilClient } from 'verteil-node-sdk';

const client = new VerteilClient({
  username:     process.env.VERTEIL_USERNAME,
  password:     process.env.VERTEIL_PASSWORD,
  thirdPartyId: process.env.VERTEIL_THIRD_PARTY_ID,
  officeId:     process.env.VERTEIL_OFFICE_ID,
});

// Search for flights
const results = await client.airShopping({
  coreQuery: {
    originDestinations: [{
      departureAirport: 'DOH',
      arrivalAirport:   'LHR',
      departureDate:    '2025-09-01',
      key:              'OD1',
    }],
  },
  travelers: [{ passengerType: 'ADT', count: 1 }],
  preference: { cabinCode: 'Y', fareTypes: ['PUBL'] },
  third_party_id: process.env.VERTEIL_THIRD_PARTY_ID,
});

console.log(results.offers);
```

---

## Configuration Reference

All keys are optional except `username` and `password`.

```js
const client = new VerteilClient({
  // ── Credentials (required) ──────────────────────────────────────────────
  username:     'your-username',        // or env VERTEIL_USERNAME
  password:     'your-password',        // or env VERTEIL_PASSWORD

  // ── Identity headers ────────────────────────────────────────────────────
  thirdPartyId: 'ACME',                 // or env VERTEIL_THIRD_PARTY_ID
  officeId:     'DOH123',               // or env VERTEIL_OFFICE_ID

  // ── Network ─────────────────────────────────────────────────────────────
  baseUrl:     'https://api.verteil.com', // or env VERTEIL_BASE_URL
  timeout:      30_000,                   // ms — or env VERTEIL_TIMEOUT
  verifySsl:    true,                     // set false only in dev

  // HTTP connection pool (passed to https.Agent)
  connectionPool: {
    maxSockets:    100,
    keepAlive:     true,
    keepAliveMsecs: 1_000,
  },

  // ── Retry ────────────────────────────────────────────────────────────────
  retry: {
    maxAttempts: 3,
    delay:       100,    // ms — base delay before first retry
    multiplier:  2,      // delay doubles on each subsequent attempt
  },

  // ── In-memory cache ──────────────────────────────────────────────────────
  cache: {
    enabled: true,
    ttl: {
      airShopping:      120,  // seconds
      flightPrice:      120,
      serviceList:      300,
      seatAvailability: 120,
    },
  },

  // ── Rate limits ──────────────────────────────────────────────────────────
  rateLimits: {
    default:     { requests: 60, duration: 60 },   // per minute
    airShopping: { requests: 30, duration: 60 },
    orderCreate: { requests: 20, duration: 60 },
  },

  // ── Logging ──────────────────────────────────────────────────────────────
  logging: {
    enabled:    true,
    level:      'info',              // 'debug' | 'info' | 'warn' | 'error'
    path:       './logs/verteil.log',
    daysToKeep: 30,
  },

  // ── Notifications ────────────────────────────────────────────────────────
  notifications: {
    slackWebhookUrl:   'https://hooks.slack.com/services/...',
    notificationEmail: 'ops@example.com',
  },

  // ── Pluggable adapters (see dedicated sections below) ────────────────────
  // cache:        new RedisCache(...)       — replaces in-memory cache
  // rateLimiter:  new RedisRateLimiter(...) — distributed limiter
  // circuitBreaker: new CircuitBreaker(...) — per-endpoint circuit breaker
  // metrics:      await VerteilMetrics.create() — Prometheus counters
  // tracer:       new VerteilTracer(...)    — OpenTelemetry spans
});
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VERTEIL_USERNAME` | — | API Basic-auth username |
| `VERTEIL_PASSWORD` | — | API Basic-auth password |
| `VERTEIL_THIRD_PARTY_ID` | — | Third-party identifier header |
| `VERTEIL_OFFICE_ID` | — | Office identifier header |
| `VERTEIL_BASE_URL` | `https://api.stage.verteil.com` | API base URL |
| `VERTEIL_TIMEOUT` | `30000` | HTTP timeout in ms |
| `VERTEIL_VERIFY_SSL` | `true` | Disable only in local dev |
| `VERTEIL_LOGGING_ENABLED` | `true` | Toggle structured logging |
| `VERTEIL_LOG_LEVEL` | `info` | Minimum log level |
| `VERTEIL_LOG_PATH` | `./logs/verteil.log` | Log file path |
| `VERTEIL_SLACK_WEBHOOK` | — | Slack webhook URL for alerts |
| `VERTEIL_NOTIFICATION_EMAIL` | — | Email for critical alerts |
| `VERTEIL_ENCRYPTION_KEY` | — | 32-byte hex key for token storage |

---

## Authentication

The client handles OAuth2 automatically on the first API call. Tokens are encrypted
with AES-256-GCM and stored in a TTL cache. You can also pre-authenticate explicitly:

```js
await client.authenticate();
// Token is now cached. Subsequent calls reuse it until it expires,
// then refresh automatically.
```

If a request returns `401 Unauthorized`, the client clears the stored token and
re-authenticates **once** before propagating an error.

```bash
# Generate a 32-byte encryption key for VERTEIL_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## API Methods

All methods are `async` and return a normalised JavaScript object or a typed
response-class instance. They throw `VerteilApiException` on API or network errors.

---

### 1. airShopping

Search for available flight offers.

```js
const results = await client.airShopping({
  coreQuery: {
    originDestinations: [{
      departureAirport: 'DOH',
      arrivalAirport:   'LHR',
      departureDate:    '2025-09-01',
      key:              'OD1',
    }],
  },
  travelers: [
    { passengerType: 'ADT', count: 2 },
    { passengerType: 'CHD', count: 1 },
  ],
  preference: {
    cabinCode:           'Y',        // Y=Economy  W=Premium  C=Business  F=First
    fareTypes:           ['PUBL'],
    sortOrder:           'ASCENDING',
    sortParam:           'PRICE',    // STOP | PRICE | DEPARTURE_TIME
    shopResultPreference: 'OPTIMIZED', // OPTIMIZED | FULL | BEST
  },
  enableGDS:    true,
  third_party_id: 'ACME',
  office_id:    'DOH123',
});

// results.offers       — normalised offer array
// results.data_lists   — airports, airlines, equipment reference data
// results.statistics   — offer count and response time
```

---

### 2. flightPrice

Price a specific offer returned by `airShopping`.

```js
const priced = await client.flightPrice({
  dataLists: {
    fares:              [{ listKey: 'FL1', code: 'YECON', fareCode: 'YOW' }],
    anonymousTravelers: [{ objectKey: 'T1', passengerType: 'ADT' }],
  },
  query: {
    originDestinations: [{
      flights: [{
        segmentKey:    'SEG1',
        departure:     { airportCode: 'DOH', date: '2025-09-01' },
        arrival:       { airportCode: 'LHR' },
        airlineCode:   'QR',
        flightNumber:  '007',
      }],
    }],
    offers: [{
      owner:      'QR',
      channel:    'NDC',
      offerId:    'OFFERID-FROM-AIRSHOPPING',
      offerItems: [{ id: 'OFFERITEM-ID', refs: ['T1'] }],
    }],
  },
  travelers: [{ passengerType: 'ADT' }],
  shoppingResponseId: {
    owner:      'QR',
    responseId: 'RESPONSEID-FROM-AIRSHOPPING',
  },
  third_party_id: 'ACME',
  office_id:    'DOH123',
});

// priced.response — raw NDC priced-offer payload
// priced.success  — boolean
```

---

### 3. createOrder

Book a priced offer and create a PNR.

```js
const order = await client.createOrder({
  query: {
    orderItems: {
      shoppingResponse: {
        owner:      'QR',
        responseId: 'RESPONSEID',
        offers: {
          Offer: [{
            owner:      'QR',
            channel:    'NDC',
            objectKey:  'OFFER1',
            offerId:    'OFFERID',
            offerItems: [{ owner: 'QR', offerId: 'OFFERITEMID' }],
          }],
        },
      },
      offerItem: [{
        owner:   'QR',
        value:   'OFFERITEMID',
        channel: 'NDC',
        detailedFlightItem: [{
          price: { baseAmount: 500, taxAmount: 60, currency: 'USD' },
          originDestination: [{
            originDestinationKey: 'OD1',
            flights: [{
              segmentKey:     'SEG1',
              departure:      { airport: 'DOH', date: '2025-09-01', time: '08:00' },
              arrival:        { airport: 'LHR', date: '2025-09-01', time: '13:30' },
              airline:        'QR',
              flightNumber:   '007',
              classOfService: 'Y',
            }],
          }],
        }],
      }],
    },
    passengers: [{
      objectKey:     'PAX1',
      passengerType: 'ADT',
      name:          { given: 'John', surname: 'Doe', title: 'MR' },
      gender:        'M',
      birthDate:     '1985-06-15',
      contacts: {
        phone:   { countryCode: '1', number: '5551234567' },
        email:   'john.doe@example.com',
        address: { street: '123 Main St', city: 'Doha', postalCode: '12345', countryCode: 'QA' },
      },
      document: {
        type:           'PT',
        number:         'AB123456',
        issuingCountry: 'QA',
        expiryDate:     '2030-01-01',
      },
    }],
  },
  payments: [{
    amount:   560,
    currency: 'USD',
    card: {
      number:     '4111111111111111',
      cvv:        '123',
      brand:      'VI',
      type:       'Credit',
      expiryDate: '1226',
      holderName: 'JOHN DOE',
    },
  }],
  third_party_id: 'ACME',
  office_id:    'DOH123',
});

// order.orderId    — airline PNR
// order.success    — boolean
// order.totalPrice — fare total including taxes
```

---

### 4. retrieveOrder

Fetch an existing order by PNR.

```js
const order = await client.retrieveOrder({
  owner:   'QR',       // 2-letter IATA airline code
  orderId: 'ABC123',   // PNR (4–8 alphanumeric characters)
  channel: 'NDC',      // optional — defaults to NDC
  third_party_id: 'ACME',
  office_id: 'DOH123',
});

// order.orderId, order.passengers, order.totalPrice, order.success
```

---

### 5. cancelOrder

Cancel one or more orders. Returns expected refund information if available.

```js
const result = await client.cancelOrder({
  orders: [
    { owner: 'QR', orderId: 'ABC123', channel: 'NDC' },
  ],
  expectedRefundAmount: {   // optional
    amount:   560,
    currency: 'USD',
  },
  correlationId:  'my-correlation-id',  // optional idempotency key
  third_party_id: 'ACME',
  office_id:      'DOH123',
});
```

#### Preview before cancelling

```js
const preview = await client.previewCancellation({
  orders: [{ owner: 'QR', orderId: 'ABC123' }],
});

console.log(preview.refundAmount, preview.penalties);
// Inspect before committing the real cancelOrder call
```

---

### 6. changeOrder

Modify an existing order (seat swap, passenger-info update, ancillary add-on).

```js
const changed = await client.changeOrder({
  orderId: { owner: 'QR', orderId: 'ABC123', channel: 'NDC' },
  changes: [
    {
      type:               'SEAT_CHANGE',
      segmentReference:   'SEG1',
      passengerReference: 'PAX1',
      seatNumber:         '14A',
    },
    {
      type:               'PASSENGER_INFO',
      passengerReference: 'PAX1',
      updates: [{ field: 'PhoneNumber', value: '+97455512345' }],
    },
  ],
  payments: [{
    amount:   25,
    currency: 'USD',
    card: {
      number:      '4111111111111111',
      securityCode: '123',
      holderName:  'JOHN DOE',
      brand:       'VI',
      expiryDate:  '1226',
    },
  }],
  correlationId:  'change-001',
  third_party_id: 'ACME',
  office_id:      'DOH123',
});

// changed.getOrderId()         — airline PNR
// changed.getStatus()          — 'CONFIRMED' | ...
// changed.getChangeFees()      — [{ type, amount, currency }]
// changed.getModifiedSegments() — array of modified flight segments
// changed.getWarnings()        — non-fatal API warnings
```

---

### 7. reshopOrder

Re-shop an existing order for an alternative fare or routing.

```js
const reshop = await client.reshopOrder({
  orderId:    { owner: 'QR', orderId: 'ABC123', channel: 'NDC' },
  qualifiers: [
    { type: 'CABIN', cabin: 'C', preferenceLevel: 'Preferred' },
    { type: 'FARE',  fareTypes: ['PUBL'] },
  ],
  segments: [{
    segmentKey: 'SEG1',
    newFlight: {
      origin:        'DOH',
      destination:   'LHR',
      departureDate: '2025-09-05',
      departureTime: '10:00',
      airlineCode:   'QR',
      flightNumber:  '003',
    },
  }],
  passengerRefs:        ['PAX1'],
  searchAlternateDates: true,
  third_party_id: 'ACME',
  office_id:      'DOH123',
});

// reshop.getReshopOffers()          — array of alternative offers
// reshop.getAlternateDateOptions()  — ±3 day alternatives
```

---

### 8. reshopItinerary

Re-shop at the full-itinerary level (segment swap, re-routing, date change).

```js
const itin = await client.reshopItinerary({
  orderId: { owner: 'QR', value: 'ABC123', channel: 'NDC' },
  itineraryChanges: [
    {
      type:           'DATE_CHANGE',
      segmentRef:     'SEG1',
      newDate:        '2025-09-10',
      newTime:        '08:00',
      flexibleDates:  { before: 2, after: 2 },
    },
    {
      type:       'SEGMENT_CHANGE',
      oldSegment: {
        origin: 'DOH', destination: 'LHR',
        departure: { date: '2025-09-01', time: '08:00' },
        arrival:   { date: '2025-09-01' },
        airline: 'QR', flightNumber: '007',
      },
      newSegment: {
        origin: 'DOH', destination: 'LHR',
        departure: { date: '2025-09-10', time: '10:00' },
        arrival:   { date: '2025-09-10' },
        airline: 'QR', flightNumber: '003',
      },
    },
  ],
  pricingQualifiers: [{ type: 'CABIN', code: 'C' }],
  third_party_id: 'ACME',
  office_id:      'DOH123',
});

// itin.getReshopResults()  — options with pricing, penalties, expiry
// itin.getDataLists()      — airports, airlines, equipment
// itin.getCorrelationId()  — trace ID
```

---

### 9. sendOrderChangeNotification

Send a schedule-change or cancellation notification to the carrier.

```js
const notif = await client.sendOrderChangeNotification({
  orderId:      { owner: 'QR', value: 'ABC123', channel: 'NDC' },
  notification: {
    type:        'SCHEDULE_CHANGE',
    reason:      'Operational requirements',
    severity:    'WARNING',
    description: 'Departure time moved by 2 hours',
    affectedSegments: [{
      segmentRef: 'SEG1',
      changeType: 'TIME_CHANGE',
      oldValue:   '08:00',
      newValue:   '10:00',
    }],
    customerNotification: { required: true, method: 'EMAIL', language: 'EN' },
  },
  alternatives: [{
    type:        'RESCHEDULE',
    description: 'Next available flight',
    validity:    { start: '2025-09-01', end: '2025-09-30' },
  }],
  third_party_id: 'ACME',
  office_id:      'DOH123',
});

// notif.isAcknowledged() — boolean
// notif.getStatus()      — 'OK' | 'ERROR' | ...
```

---

### 10. getSeatAvailability

Retrieve the seat map, either before booking (offer context) or after (order context).

#### Pre-booking

```js
import { SeatAvailability } from 'verteil-node-sdk';

const ndcBody = SeatAvailability.create('pre', {
  query: {
    originDestinations: [{ segmentRefs: ['SEG1'] }],
    offers: [{ owner: 'QR', offerId: 'OFFERID', offerItems: ['OFFERITEMID'] }],
  },
  dataLists: {
    fares:    [{ listKey: 'FL1', code: 'YECON' }],
    segments: [{
      segmentKey:       'SEG1',
      departureAirport: 'DOH',  departureDate: '2025-09-01', departureTime: '08:00',
      arrivalAirport:   'LHR',  arrivalDate:   '2025-09-01', arrivalTime:   '13:30',
      airlineCode:      'QR',   flightNumber:  '007',
    }],
  },
  travelers:          [{ objectKey: 'T1', passengerType: 'ADT' }],
  shoppingResponseId: { responseId: 'RESPONSEID' },
});

const seats = await client.getSeatAvailability({
  type:              'pre',
  query:             ndcBody.Query,
  dataLists:         ndcBody.DataLists,
  travelers:         ndcBody.Travelers,
  shoppingResponseId: ndcBody.ShoppingResponseID,
  third_party_id:    'ACME',
  office_id:         'DOH123',
});

// seats.getAvailableSeats()  — flat array of seat objects
// seats.getFlightSegments()  — segment details
// seats.getCabinLayout()     — rows / columns from first flight
// seats.toGrid()             — structured 2-D grid (see below)
```

#### Seat map grid

```js
const grid = seats.toGrid();
// {
//   'SEG001': {
//     columns: ['A', 'B', 'C', 'D', 'E', 'F'],
//     rows: [
//       {
//         number: '1',
//         seats: [
//           { column: 'A', row: '1', available: false, type: 'WINDOW',
//             price: null, restrictions: ['NO_INFANT'] },
//           ...
//         ]
//       }
//     ]
//   }
// }
```

#### Post-booking

```js
const ndcBody = SeatAvailability.create('post', { owner: 'QR', orderId: 'ABC123' });
const seats   = await client.getSeatAvailability({ type: 'post', query: ndcBody.Query, ... });
```

---

### 11. getServiceList

Retrieve available ancillary services (baggage, meals, lounge access, etc.).

#### Pre-booking

```js
import { ServiceList } from 'verteil-node-sdk';

const ndcBody = ServiceList.create('pre', {
  query: {
    originDestinations: [{
      flights: [{
        segmentKey: 'SEG1', departureAirport: 'DOH', departureDate: '2025-09-01',
        arrivalAirport: 'LHR', airlineCode: 'QR', flightNumber: '007',
      }],
    }],
    offers: [{ owner: 'QR', offerId: 'OFFERID', offerItem: 'OFFERITEMID' }],
  },
  travelers:          [{ passengerType: 'ADT' }],
  shoppingResponseId: { responseId: 'RESPONSEID' },
});

const services = await client.getServiceList({
  type:              'pre',
  query:             ndcBody.Query,
  travelers:         ndcBody.Travelers,
  shoppingResponseId: ndcBody.ShoppingResponseID,
  third_party_id:    'ACME',
  office_id:         'DOH123',
});

// services.getServices()       — normalised service array
// services.getServiceGroups()  — grouped by category
// services.getServiceBundles() — bundled ancillary offers
```

#### Post-booking

```js
const ndcBody  = ServiceList.create('post', { owner: 'QR', orderId: 'ABC123' });
const services = await client.getServiceList({ type: 'post', query: ndcBody.Query, ... });
```

---

## Streaming

Large `airShopping` payloads (50+ carriers) can exceed 5 MB. Use the
`streamAirShopping` AsyncGenerator to process offer groups incrementally:

```js
for await (const offerGroup of client.streamAirShopping({
  coreQuery:  { originDestinations: [{ ... }] },
  travelers:  [{ passengerType: 'ADT', count: 1 }],
  preference: { cabinCode: 'Y' },
})) {
  // Each iteration yields one airline's offers as they are parsed
  console.log('Airline offers:', offerGroup);
}
```

---

## DataType Builders

DataType builders are static factories that convert caller-friendly objects into the
exact NDC wire structures required by Verteil. Import them by name:

```js
import {
  AirShopping, FlightPrice, OrderCreate, OrderRetrieve,
  OrderCancel, OrderChange, OrderChangeNotif, OrderReshop,
  ItinReshop, SeatAvailability, ServiceList,
  VerteilRequestBuilder,
} from 'verteil-node-sdk';

// Passenger name
const name = VerteilRequestBuilder.createNameType('John', 'Doe', 'MR');

// Payment card
const card = VerteilRequestBuilder.createPaymentCardType(
  '4111111111111111', '123', '1226', 'JOHN DOE', 'VI'
);

// Passport / travel document
const doc = VerteilRequestBuilder.createPassengerDocumentType(
  'AB123456', 'QA', 'PT', '2030-01-01'
);

// NDC-structured SeatAvailability body
const seatBody = SeatAvailability.create('post', { owner: 'QR', orderId: 'ABC123' });
// → { Query: { OrderID: { Owner: 'QR', value: 'ABC123' } } }
```

---

## Response Objects

| Method | Return type |
|---|---|
| `airShopping()` | Plain object via `AirShoppingResponse.toArray()` |
| `flightPrice()` | Plain object via `FlightPriceResponse.toArray()` |
| `createOrder()` | Plain object via `OrderViewResponse.toArray()` |
| `retrieveOrder()` | Plain object via `OrderViewResponse.toArray()` |
| `cancelOrder()` | Raw NDC JSON |
| `changeOrder()` | `OrderChangeResponse` instance |
| `reshopOrder()` | `OrderReshopResponse` instance |
| `reshopItinerary()` | `ItinReshopResponse` instance |
| `sendOrderChangeNotification()` | `OrderChangeNotifResponse` instance |
| `getSeatAvailability()` | `SeatAvailabilityResponse` instance |
| `getServiceList()` | `ServiceListResponse` instance |

---

## Caching

Successful responses for `airShopping`, `flightPrice`, `seatAvailability`, and
`serviceList` are cached by an MD5 key derived from the endpoint name and request
parameters.

### In-memory (default)

```js
client.flushCache();              // clear all
client.flushCache('airShopping'); // clear one endpoint only

const cache = client.getCache();
const value = cache.get('airShopping', params);
cache.put('airShopping', params, data);
cache.clear();
```

**Default TTLs**

| Endpoint | TTL |
|---|---|
| `airShopping` | 120 s |
| `flightPrice` | 120 s |
| `seatAvailability` | 120 s |
| `serviceList` | 300 s |

### Redis (persistent across restarts)

```js
import { RedisCache, VerteilClient } from 'verteil-node-sdk';

// RedisCache implements the same get/put/clear interface as VerteilCache
const cache  = await RedisCache.create({ host: 'localhost', port: 6379 });
const client = new VerteilClient({ ..., cache });
// Cached results survive process restarts; keys: verteil:<endpoint>:<md5>
```

### Cache warming

Pre-populate the cache at startup so the first user requests hit a warm store:

```js
await client.prewarm([
  { endpoint: 'airShopping', params: { /* popular route */ } },
  { endpoint: 'serviceList', params: { type: 'pre', /* ... */ } },
]);
```

---

## Rate Limiting

A sliding-window counter limits how many requests each endpoint may make per minute.
Exceeding the limit throws `VerteilApiException` with `statusCode: 429` and a
`retryAfter` value in seconds.

**Default limits**

| Endpoint | Requests / 60 s |
|---|---|
| All others (default) | 60 |
| `airShopping` | 30 |
| `orderCreate` | 20 |

### Distributed rate limiting (Redis)

In multi-process deployments, use `RedisRateLimiter` so all instances share a single
counter per endpoint:

```js
import { RedisRateLimiter, VerteilClient } from 'verteil-node-sdk';

const limiter = await RedisRateLimiter.create({ host: 'localhost', port: 6379 });
const client  = new VerteilClient({ ..., rateLimiter: limiter });
// Uses Redis sorted-set sliding window — safe under concurrent Node.js processes
```

---

## Circuit Breaker

Wraps every outbound request in a per-endpoint sliding-window failure counter.
When the error rate exceeds `failureThreshold`, the breaker opens and requests
fail fast (no HTTP call, no retry budget wasted) until the `resetTimeout` elapses.

**States:** `CLOSED` → normal operation → `OPEN` → fast-fail → `HALF_OPEN` → probe
one request → back to `CLOSED` on success.

```js
import { CircuitBreaker, CircuitState, VerteilClient } from 'verteil-node-sdk';

const cb = new CircuitBreaker({
  failureThreshold: 5,         // open after 5 failures in the window
  successThreshold: 2,         // close after 2 consecutive probe successes
  resetTimeout:     30_000,    // ms before moving OPEN → HALF_OPEN
  windowSize:       60_000,    // sliding window length in ms
  onStateChange: (endpoint, from, to) => {
    console.log(`[circuit] ${endpoint}: ${from} → ${to}`);
  },
});

const client = new VerteilClient({ ..., circuitBreaker: cb });

// Inspect state at any time
console.log(cb.getState('airShopping'));   // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
console.log(cb.getStats('airShopping'));
// { state, failures, successes, lastFailureTime, windowStart }

// Manually reset a tripped breaker (e.g. after a deployment fix)
cb.reset('airShopping');
```

---

## Retry & Backoff

Failed requests are automatically retried with exponential backoff.

Retried HTTP status codes: `408`, `429`, `500`, `502`, `503`, `504`.

```
Attempt 1  →  fail  →  wait 100 ms
Attempt 2  →  fail  →  wait 200 ms
Attempt 3  →  fail  →  throw VerteilApiException
```

Configure:

```js
const client = new VerteilClient({
  retry: {
    maxAttempts: 3,    // total attempts (including the first)
    delay:       100,  // ms — base delay before the first retry
    multiplier:  2,    // delay doubles on each subsequent retry
  },
});
```

---

## Logging

All requests, responses, cache events, and errors are written as JSON to a
daily-rotating log file. Sensitive fields (`password`, `CardNumber`, `SeriesCode`,
`token`, `Authorization`) are automatically redacted before writing.

```js
const client = new VerteilClient({
  logging: {
    enabled:    true,
    level:      'info',               // 'debug' | 'info' | 'warn' | 'error'
    path:       './logs/verteil.log', // new file created at midnight
    daysToKeep: 30,                   // files older than 30 days are deleted
  },
});
```

Sample log entry:

```json
{
  "level":     "info",
  "message":   "API Request",
  "endpoint":  "airShopping",
  "stage":     "processed",
  "timestamp": "2025-09-01T08:00:00.000Z"
}
```

---

## Security

### Token encryption

OAuth2 tokens are stored with AES-256-GCM encryption. Each token gets a unique
random IV; the ciphertext includes an authentication tag to detect tampering.

```bash
# Generate key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
export VERTEIL_ENCRYPTION_KEY=<hex-output>
```

### Input sanitisation

All parameters are sanitised before being sent to the API:

- HTML tags stripped
- HTML entities encoded
- Null bytes removed

```js
import { sanitize, sanitizeString, sanitizeObject } from 'verteil-node-sdk';

const clean = sanitize({ name: '<script>alert(1)</script>' });
// → { name: '&lt;script&gt;alert(1)&lt;/script&gt;' }
```

### Data encryption

For end-to-end encryption of sensitive fields (e.g. PAN before storage):

```js
import { encrypt, decrypt } from 'verteil-node-sdk';

const { encrypted, iv, tag } = encrypt('4111111111111111');
const plain = decrypt(encrypted, iv, tag);
```

---

## Health Monitoring

```js
import { HealthMonitor } from 'verteil-node-sdk';

const monitor = new HealthMonitor();

const health = monitor.getHealthStatus();
// {
//   status:  'healthy' | 'degraded' | 'unhealthy',
//   uptime:  3600,           // seconds since process start
//   metrics: {
//     totalRequests:   150,
//     successRate:     0.99,
//     avgResponseTime: 280   // ms
//   },
//   cache: { hits: 40, misses: 110, hitRate: 0.27 },
//   token: { valid: true, expiresIn: 2700 },
//   endpoints: {
//     airShopping: { status: 'healthy', avgTime: 320 },
//     ...
//   }
// }
```

---

## Metrics

Exposes Prometheus counters and histograms. Requires `prom-client` ≥ 14 installed.

```js
import { VerteilMetrics, VerteilClient } from 'verteil-node-sdk';
import express from 'express';

const metrics = await VerteilMetrics.create({ collectDefaultMetrics: true });
const client  = new VerteilClient({ ... });
client.use({ metrics });

// Scrape endpoint
const app = express();
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.contentType());
  res.end(await metrics.export());
});
```

**Exposed metrics**

| Metric | Type | Labels |
|---|---|---|
| `verteil_requests_total` | counter | `endpoint`, `status` |
| `verteil_latency_seconds` | histogram | `endpoint` |
| `verteil_cache_hits_total` | counter | `endpoint` |
| `verteil_cache_misses_total` | counter | `endpoint` |
| `verteil_errors_total` | counter | `endpoint`, `code` |
| `verteil_retries_total` | counter | `endpoint` |
| `verteil_circuit_state` | gauge | `endpoint` |

---

## Tracing

Emits OpenTelemetry spans for each request-pipeline step: cache lookup, auth,
HTTP call, response parse. Requires `@opentelemetry/api` ≥ 1 installed and an
OTel SDK provider configured before the client starts.

```js
import { VerteilTracer, VerteilClient } from 'verteil-node-sdk';

// Set up your OTel SDK provider first (OTLP / Jaeger / Zipkin)
// then create a tracer and attach it to the client
const tracer = new VerteilTracer('my-service');
const client = new VerteilClient({ ... });
client.use({ tracer });
// Spans appear in your observability backend automatically
```

If `@opentelemetry/api` is not installed, `VerteilTracer` silently becomes a no-op
so no application changes are needed when toggling tracing.

---

## Webhooks

`VerteilWebhookServer` listens for push events from Verteil, validates the
HMAC-SHA256 signature with `crypto.timingSafeEqual` to prevent timing attacks,
and emits typed events.

```js
import { VerteilWebhookServer } from 'verteil-node-sdk';

const server = new VerteilWebhookServer({
  secret: process.env.VERTEIL_WEBHOOK_SECRET,
  port:   4000,
  path:   '/webhooks/verteil',
  // tls: { key: fs.readFileSync('key.pem'), cert: fs.readFileSync('cert.pem') }
});

// Typed events
server.on('order.changed',    payload => { /* PNR updated */ });
server.on('schedule.changed', payload => { /* flight time moved */ });
server.on('flight.cancelled', payload => { /* flight cancelled */ });
server.on('raw',              (type, body) => { /* every validated request */ });
server.on('error',            err => console.error(err));

await server.start();
// Listening on http://0.0.0.0:4000/webhooks/verteil

await server.stop();
```

---

## Helpers

### ItineraryBuilder

A high-level booking helper that stitches `airShopping → flightPrice → createOrder`
into a single call, automatically threading offer and item IDs.

```js
import { ItineraryBuilder, VerteilClient } from 'verteil-node-sdk';

const client  = new VerteilClient({ ... });
const builder = new ItineraryBuilder(client);

// Full book — search, price, and create in one call
const booking = await builder.book(
  {
    originDestinations: [{
      departureAirport: 'DEL',
      arrivalAirport:   'DXB',
      departureDate:    '2025-12-01',
      key:              'OD1',
    }],
  },
  [{ passengerType: 'ADT', count: 1 }],
  {
    type: 'card',
    card: { number: '4111...', cvv: '123', expiry: '1227', holderName: 'Jane Doe' },
  },
  { sortBy: 'price' }  // 'price' | 'duration' | 'stops'
);

// booking.order — created order
// booking.offer — offer that was priced and booked
// booking.price — final priced offer

// Search only (no booking)
const offers = await builder.search(itinerary, travelers, { sortBy: 'stops' });

// Price only (no booking)
const priced = await builder.price(offer, travelers, shoppingResponseId);
```

---

### CurrencyNormalizer

`airShopping` can return mixed currencies across carriers. `CurrencyNormalizer`
converts every price field in a response to a single target currency and annotates
each converted value with `_originalAmt` / `_originalCur` for auditability.

```js
import { CurrencyNormalizer } from 'verteil-node-sdk';

const n = new CurrencyNormalizer('USD', {
  USD: 1,
  EUR: 0.92,
  INR: 83.4,
  AED: 3.67,
});

const normalizedOffers = n.normalizeOffers(rawOffers);
// All AmountWithCurrencyCode nodes → USD, originals preserved as _originalAmt / _originalCur

// Normalise an arbitrary NDC response object
const normalized = n.normalize(rawNdcResponse);
```

---

### LoyaltyAggregator

When travellers hold multiple FFP accounts, `LoyaltyAggregator` ranks carriers by
miles-earning potential using a configurable mileage-rate map and injects the
best-matching `ProgramID` per segment.

```js
import { LoyaltyAggregator } from 'verteil-node-sdk';

const agg = new LoyaltyAggregator({
  mileageRates: { EK: 8, QR: 7, AI: 5 }, // miles earned per dollar of fare
});

// Inject best FFP program into NDC traveler objects
const enrichedTravelers = agg.enrichTravelers(travelers, segments);

// Annotate offers with estimated miles earned
const ranked = agg.rankOffersByMiles(offers, travelers);
// ranked[n]._estimatedMiles — miles earned if this offer is booked

// Annual value summary per program
const summary = agg.summarizePrograms(travelers, offers);
// { EK: { totalMiles: 12400, annualValue: 248 }, ... }
```

---

## Dead-Letter Queue

Requests that exhaust all retry attempts are pushed to the DLQ so they can be
inspected and replayed manually or by a background worker.

```js
import { DeadLetterQueue, VerteilClient } from 'verteil-node-sdk';

// In-memory (default — not persistent)
const dlq = new DeadLetterQueue();

// Redis-backed (persistent)
const dlq = await DeadLetterQueue.createRedis({ host: 'localhost' });

const client = new VerteilClient({ ... });
client.setDeadLetterQueue(dlq);

// --- Background worker: replay failures ---
const entry = await dlq.peek();   // inspect without removing
const entry = await dlq.shift();  // dequeue the oldest entry
if (entry) {
  await client[entry.endpoint](entry.params);
  await dlq.ack(entry.id);        // mark as processed
}

const all  = await dlq.getAll();  // inspect full queue
const size = await dlq.size();    // current depth
await dlq.clear();                // drain the queue
```

---

## Validation

Pure-JavaScript schema validation for all 11 endpoints. No external dependency.

```js
import { VerteilValidator } from 'verteil-node-sdk';

// Soft validation — returns result object
const { valid, errors } = VerteilValidator.validate('airShopping', params);
if (!valid) {
  console.error(errors.join('; '));
}

// Hard validation — throws VerteilApiException on failure
VerteilValidator.assert('createOrder', params);

// Register a custom schema for a non-standard endpoint
VerteilValidator.registerSchema('myEndpoint', {
  required: ['field1'],
  properties: {
    field1: { type: 'string', minLength: 1 },
  },
});
```

---

## OpenAPI Spec

Auto-generates an OpenAPI 3.1 spec from the built-in schemas, covering all 11
endpoints with request and response examples.

```js
import { generateSpec, generateSpecJson } from 'verteil-node-sdk';

// JavaScript object — import into Swagger UI, Stoplight, etc.
const spec = generateSpec({
  serverUrl: 'https://api.verteil.com',
  version:   '1.0.0',
  title:     'Verteil NDC API',
});

// JSON string — write to file or serve over HTTP
const json = generateSpecJson({ serverUrl: 'https://api.verteil.com' });
process.stdout.write(json);
```

```js
// Serve with Express
import express from 'express';
import { generateSpec } from 'verteil-node-sdk';

const app  = express();
const spec = generateSpec({ serverUrl: 'https://api.verteil.com' });
app.get('/openapi.json', (req, res) => res.json(spec));
```

---

## Mock Client

`VerteilMockClient` extends `VerteilClient` and intercepts `_makeRequest`, loading
responses from JSON fixtures in `src/mock/fixtures/`. Use it for integration tests
without a live Verteil sandbox account.

```js
import { VerteilMockClient } from 'verteil-node-sdk';

const client = new VerteilMockClient();

// Fixture files are loaded automatically from fixtures/<endpoint>.json
const result = await client.airShopping({ ... });

// One-time response override (next call only)
client.mockOnce('airShopping', { offers: [], statistics: {} });

// Permanent override until reset
client.mockAlways('flightPrice', { success: false });

// Inspection
console.log(client.callCount('airShopping')); // number of times method was called
console.log(client.getCallLog());             // full ordered call history

// Remove all overrides and reset call log
client.reset();
```

---

## TypeScript Support

Full `.d.ts` declarations ship with the package — no `@types/` package needed.

```ts
import {
  VerteilClient,
  VerteilConfig,
  VerteilApiException,
  AirShoppingResponse,
  SeatAvailabilityResponse,
  CircuitBreaker,
  CircuitState,
  RedisCache,
  RedisRateLimiter,
  VerteilMetrics,
  VerteilTracer,
  VerteilWebhookServer,
  ItineraryBuilder,
  VerteilMockClient,
  VerteilValidator,
} from 'verteil-node-sdk';

const config: VerteilConfig = {
  username: process.env.VERTEIL_USERNAME!,
  password: process.env.VERTEIL_PASSWORD!,
};

const client: VerteilClient = new VerteilClient(config);

try {
  const results = await client.airShopping({ ... });
} catch (err) {
  if (err instanceof VerteilApiException) {
    console.error(err.statusCode, err.message);
  }
}
```

---

## CLI Tool

Install the package globally or use `npx` to run commands without writing code.

```bash
npm install -g verteil-node-sdk
# or: npx verteil-node-sdk <command>
```

Set credentials via environment variables before running:

```bash
export VERTEIL_USERNAME=...
export VERTEIL_PASSWORD=...
export VERTEIL_THIRD_PARTY_ID=...
```

**Commands**

```bash
# Flight search (params from JSON file)
verteil airshopping --params search.json

# Price a specific offer
verteil flight:price --params price.json

# Order management
verteil order:create   --params order.json
verteil order:retrieve --owner QR --pnr ABC123
verteil order:cancel   --owner QR --pnr ABC123
verteil order:reshop   --params reshop.json

# Seat availability
verteil seat:availability --params seat.json

# Service list
verteil service:list --params service.json

# Export OpenAPI spec
verteil openapi --out openapi.json

# Interactive REPL (client pre-configured from environment)
verteil repl
```

---

## Error Handling

All API and network errors throw `VerteilApiException`:

```js
import { VerteilApiException } from 'verteil-node-sdk';

try {
  const results = await client.airShopping({ ... });
} catch (err) {
  if (err instanceof VerteilApiException) {
    console.error('HTTP status:',    err.statusCode);
    console.error('Message:',        err.message);
    console.error('Error response:', err.errorResponse);
    // err.retryAfter — seconds to wait (present on 429)
  } else {
    throw err; // unexpected — re-throw
  }
}
```

**Common status codes**

| Code | Cause | Automatic action |
|---|---|---|
| `400` | Validation error in request | None — fix the request |
| `401` | Bad credentials or expired token | Re-authenticate once |
| `429` | Rate limit exceeded | Honour `retryAfter` |
| `500` | Verteil internal error | Retry with backoff |
| `503` | Service unavailable | Retry with backoff |

---

## Production Checklist

```
Infrastructure
  [ ] Set VERTEIL_BASE_URL to the production endpoint (https://api.verteil.com)
  [ ] Inject VERTEIL_USERNAME and VERTEIL_PASSWORD from a secrets manager, not .env files
  [ ] Set VERTEIL_ENCRYPTION_KEY — 32 random bytes, hex-encoded
  [ ] Set VERTEIL_THIRD_PARTY_ID and VERTEIL_OFFICE_ID as provided by Verteil
  [ ] Run behind a reverse proxy (nginx / AWS ALB) that enforces HTTPS
  [ ] Confirm verifySsl: true (default) — never disable in production

Reliability
  [ ] Deploy RedisCache so cached shopping results survive restarts
  [ ] Deploy RedisRateLimiter so multiple processes share one rate counter
  [ ] Configure CircuitBreaker with thresholds that match your traffic pattern
  [ ] Attach a DeadLetterQueue (Redis-backed) for failed-request replay
  [ ] Set retry.maxAttempts = 3 (default); increase only if Verteil SLAs require it

Observability
  [ ] Set logging.level = 'info' (use 'debug' only in staging)
  [ ] Configure notifications.slackWebhookUrl for on-call alerts
  [ ] Expose the /metrics Prometheus endpoint and connect to Grafana
  [ ] Configure an OTel exporter and attach VerteilTracer to the client
  [ ] Monitor HealthMonitor.getHealthStatus() from your readiness probe

Security
  [ ] Rotate VERTEIL_ENCRYPTION_KEY on a schedule (update stored tokens after rotation)
  [ ] Rotate VERTEIL_WEBHOOK_SECRET if the secret is ever exposed
  [ ] Never log raw card numbers; the logger redacts CardNumber automatically

Performance
  [ ] Call client.prewarm(routes) at startup for high-traffic O/D pairs
  [ ] Tune cache.ttl values to match your freshness requirements
  [ ] Tune connectionPool.maxSockets to match your concurrency profile
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        VerteilClient                           │
│                                                                │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ Validator│  │Rate Limiter│  │Circuit Breaker│  │  Cache   │  │
│  └────┬─────┘  └─────┬─────┘  └──────┬───────┘  └────┬─────┘  │
│       │              │               │                │        │
│  ┌────▼──────────────▼───────────────▼────────────────▼─────┐  │
│  │                  _makeRequest()                           │  │
│  │   SecureTokenStorage → axios → RetryHandler               │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────▼───────────────────────────────┐  │
│  │         Tracing / Metrics / Logging / DLQ                 │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
         │                                        ▲
         ▼                                        │
   Verteil NDC API                       VerteilWebhookServer
```

---

*Bugs and feature requests: [alfamas/verteil-wrapper](https://github.com/alfamas/verteil-wrapper/issues)*
