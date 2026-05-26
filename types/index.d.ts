/**
 * TypeScript type declarations for the Verteil NDC API JavaScript wrapper.
 * @module @verteil/cnv-js
 */

// ── Config ────────────────────────────────────────────────────────────────────

export interface VerteilConfig {
  baseUrl:       string;
  username:      string;
  password:      string;
  timeout?:      number;
  verifySsl?:    boolean;
  thirdPartyId?: string | null;
  officeId?:     string | null;
  cache?:        VerteilCache | RedisCache;
  rateLimiter?:  RateLimiter | RedisRateLimiter;
  circuitBreaker?: CircuitBreaker;
  metrics?:      VerteilMetrics;
  tracer?:       VerteilTracer;
  deadLetterQueue?: DeadLetterQueue;
}

// ── Core client ───────────────────────────────────────────────────────────────

export class VerteilClient {
  constructor(config?: Partial<VerteilConfig>);

  authenticate(): Promise<this>;
  flushCache(endpoint?: string): void;
  getCache(): VerteilCache;
  setDeadLetterQueue(dlq: DeadLetterQueue): void;

  // Shopping
  airShopping(params: AirShoppingParams): Promise<object>;
  flightPrice(params: FlightPriceParams): Promise<object>;

  // Streaming
  streamAirShopping(params: AirShoppingParams): AsyncGenerator<object>;

  // Orders
  createOrder(params: OrderCreateParams): Promise<object>;
  retrieveOrder(params: OrderRetrieveParams): Promise<object>;
  cancelOrder(params: OrderCancelParams): Promise<object>;
  changeOrder(params: OrderChangeParams): Promise<object>;
  reshopOrder(params: OrderReshopParams): Promise<object>;
  reshopItinerary(params: ItinReshopParams): Promise<object>;
  sendOrderChangeNotification(params: OrderChangeNotifParams): Promise<object>;

  // Ancillaries
  getSeatAvailability(params: SeatAvailabilityParams): Promise<SeatAvailabilityResponse>;
  getServiceList(params: ServiceListParams): Promise<ServiceListResponse>;

  // New features
  previewCancellation(params: OrderCancelParams): Promise<CancellationPreview>;
  getFareRules(offerId: string, fareBasisCode: string, owner?: string): Promise<object>;
  prewarm(routes: PrewarmRoute[]): Promise<void>;
}

// ── Request param shapes ──────────────────────────────────────────────────────

export interface AirShoppingParams {
  coreQuery:          CoreQuery;
  travelers:          TravelerInput[];
  preference?:        FlightPreference;
  responseParameters?: object;
  enableGDS?:         boolean | null;
  qualifier?:         ShoppingQualifier | null;
  third_party_id?:    string | null;
}

export interface CoreQuery {
  originDestinations: OriginDestinationInput[];
  returnFlights?:     ReturnFlightInput[];
}

export interface OriginDestinationInput {
  key?:             string;
  departureAirport: string;
  arrivalAirport:   string;
  departureDate:    string;
  arrivalDate?:     string;
}

export interface TravelerInput {
  key?:          string;
  passengerType: 'ADT' | 'CHD' | 'INF';
  count?:        number;
  age?:          number;
}

export interface FlightPreference {
  cabin?:             CabinCode;
  preferredCarriers?: string[];
  fareType?:          string;
}

export type CabinCode = 'Y' | 'W' | 'C' | 'F';

export interface ShoppingQualifier {
  programQualifiers?: ProgramQualifier[];
  paymentCard?:       PaymentCardQualifier;
}

export interface ProgramQualifier {
  promoCode:    string;
  airlineCode:  string;
}

export interface PaymentCardQualifier {
  productType?: string;
  brandCode?:   string;
  number?:      string;
}

export interface FlightPriceParams {
  dataLists?:          DataLists;
  query:               PricingQuery;
  travelers:           RecognizedOrAnonymousTraveler[];
  shoppingResponseId?: ShoppingResponseId;
  party?:              CorporateParty | null;
  parameters?:         PricingParameters | null;
  qualifier?:          FlightPriceQualifier | null;
  metadata?:           MetadataBlock[];
}

export interface OrderCreateParams {
  query:       OrderQuery;
  passengers:  PassengerInput[];
  payments:    PaymentInput[];
  party?:      CorporateParty | null;
  commission?: CommissionInput | null;
  metadata?:   MetadataBlock[];
}

export interface OrderRetrieveParams {
  owner:    string;
  orderId:  string;
  channel?: string;
  refs?:    string[];
}

export interface OrderCancelParams {
  orders:                  OrderIdInput[];
  expectedRefundAmount?:   RefundAmount;
  metadata?:               MetadataBlock[];
  correlationId?:          string;
}

export interface OrderChangeParams {
  orderId:       OrderIdInput;
  changes:       ChangeDirective[];
  passengers?:   PassengerInput[];
  payments?:     PaymentInput[];
  correlationId?: string;
}

export interface OrderReshopParams {
  orderId?:     string;
  owner?:       string;
  qualifiers?:  ReshopQualifier[];
  segments?:    SegmentInput[];
  passengerRefs?: string[];
}

export interface ItinReshopParams {
  orderId:  string;
  owner?:   string;
  changes:  ItinChangeDirective[];
}

export interface OrderChangeNotifParams {
  orderId:     string;
  owner?:      string;
  notifType:   'SCHEDULE_CHANGE' | 'FLIGHT_CANCEL' | 'ROUTE_CHANGE' | 'AIRCRAFT_CHANGE';
  segments?:   SegmentInput[];
  alternatives?: object[];
}

export interface SeatAvailabilityParams {
  type:           'pre' | 'post';
  query?:         SeatQuery;
  orderId?:       string;
  owner?:         string;
  travelers?:     RecognizedOrAnonymousTraveler[];
  dataLists?:     DataLists;
}

export interface ServiceListParams {
  type:        'pre' | 'post';
  query?:      ServiceQuery;
  orderId?:    string;
  owner?:      string;
  travelers?:  RecognizedOrAnonymousTraveler[];
}

export interface PrewarmRoute {
  endpoint: string;
  params:   object;
}

// ── Supporting types ──────────────────────────────────────────────────────────

export interface ShoppingResponseId {
  owner:      string;
  responseId: string;
}

export interface CorporateParty {
  corporateCode: string;
  name?:         string;
  department?:   string;
  contact?:      ContactInfo;
}

export interface ContactInfo {
  email:            string;
  phoneNumber:      string;
  phoneCountryCode?: string;
}

export interface PassengerInput {
  objectKey?:    string;
  passengerType: 'ADT' | 'CHD' | 'INF';
  name?:         NameInput;
  document?:     DocumentInput;
  contact?:      ContactInfoFull;
  frequentFlyer?: FrequentFlyerInput;
  birthDate?:    string;
  gender?:       string;
  nationality?:  string;
}

export interface NameInput {
  given:    string | string[];
  surname:  string;
  title?:   string | null;
}

export interface DocumentInput {
  type?:       string;
  number:      string;
  country:     string;
  expiryDate?: string | null;
}

export interface ContactInfoFull {
  phone:   PhoneInput;
  email:   string;
  address: AddressInput;
}

export interface PhoneInput {
  countryCode: string;
  number:      string;
}

export interface AddressInput {
  street:      string;
  city:        string;
  postalCode:  string;
  countryCode: string;
}

export interface FrequentFlyerInput {
  airlineCode:   string;
  accountNumber: string;
  programId?:    string | null;
}

export interface PaymentInput {
  type:  'card' | 'cash' | 'voucher';
  card?: {
    number:     string;
    cvv:        string;
    expiry:     string;
    holderName: string;
    brand?:     string;
  };
  amount?:   number;
  currency?: string;
}

export interface OrderIdInput {
  owner:    string;
  orderId:  string;
  channel?: string;
  refs?:    string[];
}

export interface RefundAmount {
  amount:   number;
  currency: string;
}

export interface DataLists {
  fares?:               FareInput[];
  anonymousTravelers?:  AnonymousTravelerInput[];
  recognizedTravelers?: RecognizedTravelerInput[];
}

export interface FareInput {
  listKey:  string;
  code:     string;
  fareCode: string;
  refs?:    string | string[];
}

export interface AnonymousTravelerInput {
  objectKey:     string;
  passengerType: string;
  age?:          { value?: number; birthDate?: string };
}

export interface RecognizedTravelerInput {
  objectKey:     string;
  passengerType: string;
  frequentFlyer?: FrequentFlyerInput[];
  name?:          NameInput | null;
}

export type RecognizedOrAnonymousTraveler = AnonymousTravelerInput | RecognizedTravelerInput;

export interface PricingParameters {
  currency: string;
}

export interface FlightPriceQualifier {
  programQualifiers?: ProgramQualifier[];
  paymentCard?:       PaymentCardQualifier;
}

export interface PricingQuery {
  originDestinations: object[];
  offers:             OfferInput[];
}

export interface OfferInput {
  owner:       string;
  offerId:     string;
  channel?:    string;
  offerItems:  OfferItemInput[];
  refs?:       string[];
}

export interface OfferItemInput {
  id:            string;
  refs?:         string;
  selectedSeats?: SeatSelectionInput[];
}

export interface SeatSelectionInput {
  segmentRefs: string;
  travelerRef: string;
  column:      string;
  row:         string;
}

export interface OrderQuery {
  orderItems:  OrderItemInput[];
  offerId?:    string;
  owner?:      string;
  channel?:    string;
}

export interface OrderItemInput {
  offerItemRefId: string;
  paxRefIds:      string[];
}

export interface CommissionInput {
  amount?:     number;
  percentage?: number;
  currency?:   string;
}

export interface MetadataBlock {
  priceMetadata?: PriceMetadataInput[];
}

export interface PriceMetadataInput {
  key:       string;
  type?:     string;
  javaType?: string;
  value:     string;
}

export interface ChangeDirective {
  type: 'FLIGHT_CHANGE' | 'PASSENGER_INFO' | 'ADD_SERVICE' | 'SEAT_CHANGE';
  [key: string]: unknown;
}

export interface ItinChangeDirective {
  type:        'SEGMENT_CHANGE' | 'ROUTING_CHANGE' | 'DATE_CHANGE';
  segmentRef?: string;
  newDate?:    string;
  [key: string]: unknown;
}

export interface ReshopQualifier {
  type:      'CABIN' | 'FARE' | 'SERVICE';
  cabin?:    string;
  fareBasis?: string;
  serviceCode?: string;
}

export interface SegmentInput {
  origin:        string;
  destination:   string;
  departureDate: string;
  departureTime?: string;
  arrivalDate?:  string;
  arrivalTime?:  string;
  airlineCode:   string;
  flightNumber:  string;
  operatingCarrier?: { code: string; flightNumber: string };
}

export interface SeatQuery {
  originDestinations?: object[];
  offers?:             OfferInput[];
  dataLists?:          DataLists;
}

export interface ServiceQuery {
  originDestinations?: object[];
  offers?:             OfferInput[];
}

export interface CancellationPreview {
  orderId:    string;
  owner:      string;
  refundAmount?: RefundAmount;
  penalties?:    object[];
  conditions?:   string[];
}

// ── Exception ─────────────────────────────────────────────────────────────────

export class VerteilApiException extends Error {
  readonly statusCode: number;
  readonly original:   Error | null;
  readonly body:       object | null;

  constructor(message: string, statusCode?: number, original?: Error | null, body?: object | null);
}

// ── Request classes ───────────────────────────────────────────────────────────

export class BaseRequest {
  getEndpoint(): string;
  toArray(): object;
  getHeaders(): Record<string, string | null>;
}

export class AirShoppingRequest     extends BaseRequest { constructor(params: AirShoppingParams); }
export class FlightPriceRequest     extends BaseRequest { constructor(...args: unknown[]); }
export class OrderCreateRequest     extends BaseRequest { constructor(...args: unknown[]); }
export class OrderRetrieveRequest   extends BaseRequest { constructor(query: object); }
export class OrderCancelRequest     extends BaseRequest { constructor(...args: unknown[]); }
export class OrderChangeRequest     extends BaseRequest { constructor(...args: unknown[]); }
export class OrderReshopRequest     extends BaseRequest { constructor(...args: unknown[]); }
export class ItinReshopRequest      extends BaseRequest { constructor(...args: unknown[]); }
export class OrderChangeNotifRequest extends BaseRequest { constructor(...args: unknown[]); }
export class SeatAvailabilityRequest extends BaseRequest { constructor(...args: unknown[]); }
export class ServiceListRequest     extends BaseRequest { constructor(...args: unknown[]); }

// ── Response classes ──────────────────────────────────────────────────────────

export class BaseResponse {
  readonly data: object;
  constructor(data: object);
  toArray(): object;
  hasErrors(): boolean;
  getErrors(): ErrorItem[];
}

export interface ErrorItem {
  code?:      string;
  message?:   string;
  type?:      string;
  shortText?: string;
}

export class AirShoppingResponse     extends BaseResponse { getOffers(): object[]; getShoppingResponseId(): object; }
export class FlightPriceResponse     extends BaseResponse { getPricedOffers(): object[]; }
export class OrderViewResponse       extends BaseResponse { getOrderId(): object; getPassengers(): object[]; getOrderItems(): object[]; }
export class OrderChangeResponse     extends BaseResponse {}
export class OrderReshopResponse     extends BaseResponse {}
export class ItinReshopResponse      extends BaseResponse {}
export class OrderChangeNotifResponse extends BaseResponse {}

export class SeatAvailabilityResponse extends BaseResponse {
  getAvailableSeats(): object[];
  getFlightSegments(): object[];
  getCabinLayout(): object[];
  toGrid(): SeatGrid;
}

export interface SeatGrid {
  [segmentKey: string]: {
    columns: string[];
    rows:    SeatRow[];
  };
}

export interface SeatRow {
  number:  string;
  seats:   SeatCell[];
}

export interface SeatCell {
  column:      string;
  row:         string;
  available:   boolean;
  type?:       string;
  price?:      object | null;
  restrictions?: string[];
}

export class ServiceListResponse extends BaseResponse { getServices(): object[]; }

// ── DataType builders ─────────────────────────────────────────────────────────

export class AirShopping {
  static create(params?: Partial<AirShoppingParams>): AirShoppingParams;
}

export class FlightPrice      { static create(params?: object): object; }
export class OrderCreate      { static create(params?: object): object; }
export class OrderRetrieve    { static create(params?: object): object; }
export class OrderCancel      { static create(params?: object): object; }
export class OrderChange      { static create(params?: object): object; }
export class OrderChangeNotif { static create(params?: object): object; }
export class OrderReshop      { static create(params?: object): object; }
export class ItinReshop       { static create(params?: object): object; }
export class SeatAvailability { static create(params?: object): object; }
export class ServiceList      { static create(params?: object): object; }

export class VerteilRequestBuilder {
  static createNameType(given: string | string[], surname: string, title?: string | null): NameInput;
  static createContactType(phoneNumber: string, email: string, street: string, city: string, postalCode: string, countryCode: string, phoneCountryCode?: string): ContactInfoFull;
  static createPassengerDocumentType(documentNumber: string, issuingCountry: string, type?: string, expiryDate?: string | null): DocumentInput;
  static createPaymentCardType(cardNumber: string, cvv: string, expiryDate: string, holderName: string, brand?: string): PaymentInput;
  static createFlightType(departureAirport: string, arrivalAirport: string, departureDate: string, departureTime: string, airlineCode: string, flightNumber: string, arrivalDate?: string | null, arrivalTime?: string | null, classOfService?: string | null): SegmentInput;
  static createPriceType(baseAmount: number, taxAmount: number, currency: string): { baseAmount: number; totalTax: number; currency: string };
}

// ── Cache ─────────────────────────────────────────────────────────────────────

export class VerteilCache {
  constructor(cacheableEndpoints?: Record<string, number>);
  get(endpoint: string, params: object): object | null;
  put(endpoint: string, params: object, data: object): void;
  clear(endpoint?: string): void;
}

export class RedisCache {
  static create(redisOptions?: object, cacheableEndpoints?: Record<string, number>): Promise<RedisCache>;
  get(endpoint: string, params: object): Promise<object | null>;
  put(endpoint: string, params: object, data: object): Promise<void>;
  clear(endpoint?: string): Promise<void>;
  disconnect(): Promise<void>;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

export class RateLimiter {
  constructor(limits?: Record<string, { requests: number; duration: number }>);
  attempt(endpoint: string): boolean;
  remaining(endpoint: string): number;
  retryAfter(endpoint: string): number;
  clear(endpoint: string): void;
  clearAll(): void;
}

export class RedisRateLimiter {
  static create(redisOptions?: object, limits?: Record<string, { requests: number; duration: number }>): Promise<RedisRateLimiter>;
  attempt(endpoint: string): Promise<boolean>;
  remaining(endpoint: string): Promise<number>;
  retryAfter(endpoint: string): Promise<number>;
  clear(endpoint: string): Promise<void>;
  disconnect(): Promise<void>;
}

// ── Circuit breaker ───────────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?:  number;
  successThreshold?:  number;
  resetTimeout?:      number;
  windowSize?:        number;
  onStateChange?:     (endpoint: string, from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker {
  constructor(options?: CircuitBreakerOptions);
  execute<T>(endpoint: string, fn: () => Promise<T>): Promise<T>;
  getState(endpoint: string): CircuitState;
  getStats(endpoint: string): { state: CircuitState; failures: number; successes: number; lastFailureAt: number | null };
  reset(endpoint: string): void;
}

// ── Dead letter queue ─────────────────────────────────────────────────────────

export interface DlqEntry {
  id:          string;
  endpoint:    string;
  params:      object;
  error:       { message?: string; code?: string; status?: number };
  enqueuedAt:  string;
  attempts:    number;
}

export class DeadLetterQueue {
  constructor(options?: { maxSize?: number });
  static createRedis(redisOptions?: object, listKey?: string): Promise<DeadLetterQueue>;
  push(endpoint: string, params: object, error: Error): Promise<string>;
  peek(): Promise<DlqEntry | null>;
  shift(): Promise<DlqEntry | null>;
  ack(id: string): Promise<boolean>;
  getAll(): Promise<DlqEntry[]>;
  size(): Promise<number>;
  clear(): Promise<void>;
  disconnect(): Promise<void>;
}

// ── Observability ─────────────────────────────────────────────────────────────

export class VerteilLogger {
  constructor(config?: object);
  logRequest(endpoint: string, data: object): void;
  logResponse(endpoint: string, statusCode: number, data: object): void;
  logError(endpoint: string, error: Error, context?: object): void;
}

export class VerteilTracer {
  constructor(serviceName?: string);
  trace<T>(spanName: string, attrs: Record<string, string | number | boolean>, fn: (span: unknown) => Promise<T>): Promise<T>;
  traceCache(endpoint: string, hit: boolean, fn: () => Promise<unknown>): Promise<unknown>;
  traceHttp(endpoint: string, url: string, fn: () => Promise<unknown>): Promise<unknown>;
  traceParse(endpoint: string, fn: () => Promise<unknown>): Promise<unknown>;
}

export class VerteilMetrics {
  static create(options?: { collectDefaultMetrics?: boolean }): Promise<VerteilMetrics>;
  recordRequest(endpoint: string, statusCode: number): void;
  startTimer(endpoint: string): () => void;
  recordCacheHit(endpoint: string): void;
  recordCacheMiss(endpoint: string): void;
  recordError(endpoint: string, code?: string): void;
  recordRetry(endpoint: string): void;
  recordCircuitState(endpoint: string, state: CircuitState): void;
  export(): Promise<string>;
  contentType(): string;
}

export class HealthMonitor {
  recordRequest(endpoint: string, responseTime: number, success: boolean): void;
  getHealthStatus(): HealthStatus;
  resetStats(endpoint?: string): void;
}

export interface HealthStatus {
  healthy:   boolean;
  endpoints: Record<string, EndpointHealth>;
  uptime:    number;
}

export interface EndpointHealth {
  healthy:          boolean;
  totalRequests:    number;
  successRate:      number;
  avgResponseTime:  number;
  errorRate:        number;
}

export class VerteilNotifier {
  constructor(config?: { slackWebhookUrl?: string; notificationEmail?: string; emailRelayUrl?: string });
  notify(level: 'emergency' | 'alert' | 'critical', message: string, ctx?: object): Promise<void>;
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export interface WebhookOptions {
  secret?:          string;
  port?:            number;
  path?:            string;
  signatureHeader?: string;
  tls?:             object;
}

export class VerteilWebhookServer {
  constructor(options?: WebhookOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly port: number | null;
  on(event: 'order.changed' | 'schedule.changed' | 'flight.cancelled' | 'raw' | 'unknown' | 'error', listener: (data: object | Error) => void): this;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export class CurrencyNormalizer {
  constructor(targetCurrency: string, fxRates: Record<string, number>, decimals?: number);
  normalizeOffers(offers: object[]): object[];
  normalizeNode(node: object): object;
  convert(amount: number, fromCurrency: string): number;
}

export class ItineraryBuilder {
  constructor(client: VerteilClient, options?: { sortBy?: 'price' | 'duration' | 'stops' });
  book(itinerary: ItineraryInput, passengers: TravelerInput[], payment: PaymentInput, options?: { offerIndex?: number }): Promise<object>;
  search(itinerary: ItineraryInput, passengers: TravelerInput[]): Promise<object[]>;
  price(offer: object, shopResult: object, passengers: TravelerInput[]): Promise<object>;
}

export interface ItineraryInput {
  originDestinations: OriginDestinationInput[];
  cabin?:             CabinCode;
  preferredCarriers?: string[];
  sortBy?:            'price' | 'duration' | 'stops';
}

export class LoyaltyAggregator {
  constructor(options?: { mileageRates?: Record<string, number>; preferHigherTier?: boolean; tierMap?: Record<string, number> });
  enrichTravelers(travelers: PassengerInput[], segments: SegmentInput[]): PassengerInput[];
  rankOffersByMiles(offers: object[], travelers: PassengerInput[]): object[];
  estimateMilesEarned(airlineCode: string, baseAmount: number, fqtvs: FrequentFlyerInput[]): number;
  summarizePrograms(fqtvs: FrequentFlyerInput[], annualSpend: number): LoyaltyProgramSummary[];
}

export interface LoyaltyProgramSummary {
  airline:        string;
  programId?:     string;
  accountNumber?: string;
  annualMiles:    number;
  estimatedValue: number;
}

// ── Mock client ───────────────────────────────────────────────────────────────

export class VerteilMockClient extends VerteilClient {
  constructor(config?: Partial<VerteilConfig>, fixtures?: Record<string, unknown>);
  mockOnce(endpoint: string, response: unknown): this;
  mockAlways(endpoint: string, response: unknown): this;
  reset(): this;
  getCallLog(): Array<{ endpoint: string; params: object; calledAt: string }>;
  callCount(endpoint: string): number;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:  boolean;
  errors: string[];
}

export class VerteilValidator {
  static validate(endpoint: string, params: object): ValidationResult;
  static assert(endpoint: string, params: object): void;
  static getSchema(endpoint: string): object | null;
  static registerSchema(endpoint: string, schema: object): void;
}

// ── OpenAPI ───────────────────────────────────────────────────────────────────

export interface OpenApiOptions {
  serverUrl?: string;
  title?:     string;
  version?:   string;
}

export function generateSpec(options?: OpenApiOptions): object;
export function generateSpecJson(options?: OpenApiOptions): string;

// ── Security ──────────────────────────────────────────────────────────────────

export class SecureTokenStorage {
  hasValidToken(): boolean;
  storeToken(token: string, expiresIn?: number): void;
  retrieveToken(): string | null;
  clearToken(): void;
}

export function sanitize(input: object): object;
export function sanitizeString(str: string): string;
export function sanitizeObject(obj: object): object;
export function validatePattern(value: string, pattern: RegExp): boolean;
export function encrypt(data: string, key?: string): string;
export function decrypt(encrypted: string, key?: string): string;

// ── Retry ─────────────────────────────────────────────────────────────────────

export class RetryHandler {
  execute<T>(fn: () => Promise<T>, endpoint?: string): Promise<T>;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const defaults: VerteilConfig;
