/**
 * @fileoverview Default configuration values for the Verteil NDC API client.
 *
 * All values can be overridden by the caller when constructing VerteilClient.
 * Environment variables are read at import-time and used as fallbacks.
 */

/**
 * @typedef {Object} VerteilConfig
 * @property {string}  username           - API username (Basic-auth credential).
 * @property {string}  password           - API password (Basic-auth credential).
 * @property {string}  [thirdPartyId]     - Optional Verteil third-party identifier.
 * @property {string}  [officeId]         - Optional agency office identifier.
 * @property {string}  baseUrl            - Root URL of the Verteil API.
 * @property {number}  timeout            - HTTP request timeout in milliseconds.
 * @property {boolean} verifySsl          - Whether to enforce TLS certificate verification.
 * @property {Object}  retry              - Retry policy.
 * @property {number}    retry.maxAttempts - Maximum number of request attempts.
 * @property {number}    retry.delay       - Base delay between retries (ms).
 * @property {number}    retry.multiplier  - Exponential back-off multiplier.
 * @property {Object}  cache              - Response caching settings.
 * @property {boolean}   cache.enabled    - Whether caching is active.
 * @property {Object}    cache.ttl        - Per-endpoint TTL values in seconds.
 * @property {Object}  rateLimits         - Per-endpoint rate-limit configurations.
 * @property {Object}  logging            - Logging behaviour.
 * @property {Object}  monitoring         - Health-monitoring settings.
 * @property {Object}  notifications      - Alert / notification settings.
 */

/** @type {VerteilConfig} */
const defaults = {
  username:     process.env.VERTEIL_USERNAME     ?? '',
  password:     process.env.VERTEIL_PASSWORD     ?? '',
  thirdPartyId: process.env.VERTEIL_THIRD_PARTY_ID ?? null,
  officeId:     process.env.VERTEIL_OFFICE_ID    ?? null,

  baseUrl:   process.env.VERTEIL_BASE_URL  ?? 'https://api.stage.verteil.com',
  timeout:   parseInt(process.env.VERTEIL_TIMEOUT ?? '30000', 10),
  verifySsl: process.env.VERTEIL_VERIFY_SSL !== 'false',

  retry: {
    maxAttempts: 3,
    delay:       100,
    multiplier:  2,
  },

  cache: {
    enabled: true,
    ttl: {
      airShopping:      120,
      flightPrice:      120,
      serviceList:      300,
      seatAvailability: 120,
    },
  },

  rateLimits: {
    default: {
      requests: 60,
      duration: 60,
    },
    airShopping: {
      requests: 30,
      duration: 60,
    },
    orderCreate: {
      requests: 20,
      duration: 60,
    },
  },

  logging: {
    enabled: process.env.VERTEIL_LOGGING_ENABLED !== 'false',
    level:   process.env.VERTEIL_LOG_LEVEL ?? 'info',
    path:    process.env.VERTEIL_LOG_PATH  ?? './logs/verteil.log',
    events: {
      requests:  true,
      responses: true,
      errors:    true,
      auth:      true,
    },
    daysToKeep: 30,
    maxDepth:   20,
  },

  monitoring: {
    enabled:           true,
    metricsRetention:  24,
  },

  notifications: {
    slackWebhookUrl:    process.env.VERTEIL_SLACK_WEBHOOK       ?? null,
    notificationEmail:  process.env.VERTEIL_NOTIFICATION_EMAIL  ?? null,
  },
};

export default defaults;
