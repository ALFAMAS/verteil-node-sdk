/**
 * @fileoverview Public entry point for the Verteil NDC API JavaScript wrapper.
 *
 * Exports the main client, all request/response classes, DataType builders,
 * utility helpers, and the custom exception — enabling consumers to import
 * exactly what they need.
 *
 * @example
 * // Minimal usage
 * import { VerteilClient } from '@verteil/cnv-js';
 * const client = new VerteilClient({ username: '...', password: '...' });
 * const offers = await client.airShopping({ ... });
 *
 * @example
 * // Named imports for DataType builders
 * import { FlightPrice, OrderCreate } from '@verteil/cnv-js';
 * const body = FlightPrice.create({ ... });
 */

// ── Core client ───────────────────────────────────────────────────────────────
export { default as VerteilClient } from './src/VerteilClient.js';

// ── Exception ─────────────────────────────────────────────────────────────────
export { default as VerteilApiException } from './src/exceptions/VerteilApiException.js';

// ── Request classes ───────────────────────────────────────────────────────────
export { default as AirShoppingRequest      } from './src/requests/AirShoppingRequest.js';
export { default as FlightPriceRequest      } from './src/requests/FlightPriceRequest.js';
export { default as OrderCreateRequest      } from './src/requests/OrderCreateRequest.js';
export { default as OrderRetrieveRequest    } from './src/requests/OrderRetrieveRequest.js';
export { default as OrderCancelRequest      } from './src/requests/OrderCancelRequest.js';
export { default as OrderChangeRequest      } from './src/requests/OrderChangeRequest.js';
export { default as OrderReshopRequest      } from './src/requests/OrderReshopRequest.js';
export { default as ItinReshopRequest       } from './src/requests/ItinReshopRequest.js';
export { default as OrderChangeNotifRequest } from './src/requests/OrderChangeNotifRequest.js';
export { default as SeatAvailabilityRequest } from './src/requests/SeatAvailabilityRequest.js';
export { default as ServiceListRequest      } from './src/requests/ServiceListRequest.js';

// ── Response classes ──────────────────────────────────────────────────────────
export { default as AirShoppingResponse      } from './src/responses/AirShoppingResponse.js';
export { default as FlightPriceResponse      } from './src/responses/FlightPriceResponse.js';
export { default as OrderViewResponse        } from './src/responses/OrderViewResponse.js';
export { default as OrderChangeResponse      } from './src/responses/OrderChangeResponse.js';
export { default as OrderReshopResponse      } from './src/responses/OrderReshopResponse.js';
export { default as ItinReshopResponse       } from './src/responses/ItinReshopResponse.js';
export { default as OrderChangeNotifResponse } from './src/responses/OrderChangeNotifResponse.js';
export { default as SeatAvailabilityResponse } from './src/responses/SeatAvailabilityResponse.js';
export { default as ServiceListResponse      } from './src/responses/ServiceListResponse.js';

// ── DataType builders ─────────────────────────────────────────────────────────
export { default as AirShopping           } from './src/dataTypes/AirShopping.js';
export { default as FlightPrice           } from './src/dataTypes/FlightPrice.js';
export { default as OrderCreate           } from './src/dataTypes/OrderCreate.js';
export { default as OrderRetrieve         } from './src/dataTypes/OrderRetrieve.js';
export { default as OrderCancel           } from './src/dataTypes/OrderCancel.js';
export { default as OrderChange           } from './src/dataTypes/OrderChange.js';
export { default as OrderChangeNotif      } from './src/dataTypes/OrderChangeNotif.js';
export { default as OrderReshop           } from './src/dataTypes/OrderReshop.js';
export { default as ItinReshop            } from './src/dataTypes/ItinReshop.js';
export { default as SeatAvailability      } from './src/dataTypes/SeatAvailability.js';
export { default as ServiceList           } from './src/dataTypes/ServiceList.js';
export { default as VerteilRequestBuilder } from './src/dataTypes/VerteilRequestBuilder.js';

// ── Utilities ─────────────────────────────────────────────────────────────────
export { default as VerteilCache       } from './src/cache/VerteilCache.js';
export { default as RedisCache         } from './src/cache/RedisCache.js';
export { default as RateLimiter        } from './src/rateLimit/RateLimiter.js';
export { default as RedisRateLimiter   } from './src/rateLimit/RedisRateLimiter.js';
export { default as RetryHandler       } from './src/retry/RetryHandler.js';
export { default as VerteilLogger      } from './src/logging/VerteilLogger.js';
export { default as HealthMonitor      } from './src/monitoring/HealthMonitor.js';
export { default as VerteilNotifier    } from './src/notifications/VerteilNotifier.js';
export { default as SecureTokenStorage } from './src/security/SecureTokenStorage.js';
export { sanitize, sanitizeString, sanitizeObject } from './src/security/sanitizeInput.js';
export { encrypt, decrypt }                         from './src/security/encryptData.js';
export { default as defaults           } from './src/config/defaults.js';

// ── Circuit breaker ───────────────────────────────────────────────────────────
export { default as CircuitBreaker, State as CircuitState } from './src/circuitBreaker/CircuitBreaker.js';

// ── Dead-letter queue ─────────────────────────────────────────────────────────
export { default as DeadLetterQueue    } from './src/queue/DeadLetterQueue.js';

// ── Observability ─────────────────────────────────────────────────────────────
export { default as VerteilTracer      } from './src/tracing/VerteilTracer.js';
export { default as VerteilMetrics     } from './src/metrics/VerteilMetrics.js';
export { default as VerteilWebhookServer } from './src/webhooks/VerteilWebhookServer.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
export { default as CurrencyNormalizer } from './src/helpers/CurrencyNormalizer.js';
export { default as ItineraryBuilder   } from './src/helpers/ItineraryBuilder.js';
export { default as LoyaltyAggregator  } from './src/helpers/LoyaltyAggregator.js';

// ── Mock client ───────────────────────────────────────────────────────────────
export { default as VerteilMockClient  } from './src/mock/VerteilMockClient.js';

// ── Validation ────────────────────────────────────────────────────────────────
export { default as VerteilValidator   } from './src/validation/VerteilValidator.js';

// ── OpenAPI ───────────────────────────────────────────────────────────────────
export { generateSpec, generateSpecJson } from './src/openapi/spec.js';
