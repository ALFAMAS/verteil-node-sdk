/**
 * @fileoverview Schema-based request validation for Verteil NDC endpoints.
 *
 * Replaces the hand-rolled `if (!field) throw` guards in each request class
 * with a declarative JSON-Schema-like validation engine.  No external
 * dependencies — the engine is implemented in pure JS.
 *
 * @example
 * import VerteilValidator from './src/validation/VerteilValidator.js';
 *
 * const result = VerteilValidator.validate('airShopping', params);
 * if (!result.valid) {
 *   console.error(result.errors);
 * }
 */

// ── Schema definitions ─────────────────────────────────────────────────────

const SCHEMAS = {
  airShopping: {
    type: 'object',
    required: ['coreQuery', 'travelers'],
    properties: {
      coreQuery: {
        type: 'object',
        required: ['originDestinations'],
        properties: {
          originDestinations: {
            type: 'array', minItems: 1,
            items: {
              type: 'object',
              required: ['departureAirport', 'arrivalAirport', 'departureDate'],
              properties: {
                departureAirport: { type: 'string', pattern: '^[A-Z]{3}$' },
                arrivalAirport:   { type: 'string', pattern: '^[A-Z]{3}$' },
                departureDate:    { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
              },
            },
          },
        },
      },
      travelers: { type: 'array', minItems: 1 },
    },
  },

  flightPrice: {
    type: 'object',
    required: ['query'],
    properties: {
      query: {
        type: 'object',
        required: ['originDestinations', 'offers'],
        properties: {
          originDestinations: { type: 'array', minItems: 1 },
          offers:             { type: 'array', minItems: 1 },
        },
      },
    },
  },

  orderCreate: {
    type: 'object',
    required: ['query', 'passengers', 'payments'],
    properties: {
      passengers: { type: 'array', minItems: 1 },
      payments:   { type: 'array', minItems: 1 },
    },
  },

  orderRetrieve: {
    type: 'object',
    required: ['owner', 'orderId'],
    properties: {
      owner:   { type: 'string', pattern: '^[A-Z]{2}$' },
      orderId: { type: 'string', minLength: 4, maxLength: 8 },
    },
  },

  orderCancel: {
    type: 'object',
    required: ['orders'],
    properties: {
      orders: {
        type: 'array', minItems: 1,
        items: {
          type: 'object',
          required: ['owner', 'orderId'],
          properties: {
            owner:   { type: 'string', pattern: '^[A-Z]{2}$' },
            orderId: { type: 'string', minLength: 4 },
          },
        },
      },
    },
  },

  orderChange: {
    type: 'object',
    required: ['orderId', 'changes'],
    properties: {
      orderId: {
        type: 'object',
        required: ['owner', 'orderId'],
      },
      changes: { type: 'array', minItems: 1 },
    },
  },

  orderReshop: {
    type: 'object',
    required: ['orderId'],
    properties: {
      orderId: { type: 'string', minLength: 4 },
      owner:   { type: 'string', pattern: '^[A-Z]{2}$' },
    },
  },

  itinReshop: {
    type: 'object',
    required: ['orderId', 'changes'],
    properties: {
      orderId: { type: 'string', minLength: 4 },
      changes: { type: 'array', minItems: 1 },
    },
  },

  orderChangeNotif: {
    type: 'object',
    required: ['orderId', 'notifType'],
    properties: {
      notifType: {
        type: 'string',
        enum: ['SCHEDULE_CHANGE', 'FLIGHT_CANCEL', 'ROUTE_CHANGE', 'AIRCRAFT_CHANGE'],
      },
    },
  },

  seatAvailability: {
    type: 'object',
    required: ['type'],
    properties: {
      type: { type: 'string', enum: ['pre', 'post'] },
    },
  },

  serviceList: {
    type: 'object',
    required: ['type'],
    properties: {
      type: { type: 'string', enum: ['pre', 'post'] },
    },
  },
};

// ── Validation engine ──────────────────────────────────────────────────────

/**
 * @class VerteilValidator
 */
class VerteilValidator {
  /**
   * Validates `params` against the schema for `endpoint`.
   *
   * @param {string} endpoint  Verteil endpoint name.
   * @param {Object} params    Parameters to validate.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validate(endpoint, params) {
    const schema = SCHEMAS[endpoint];
    if (!schema) return { valid: true, errors: [] };

    const errors = [];
    VerteilValidator._check(params, schema, endpoint, errors);
    return { valid: errors.length === 0, errors };
  }

  /**
   * Like `validate` but throws a descriptive `Error` on the first violation.
   *
   * @param {string} endpoint
   * @param {Object} params
   * @throws {Error}
   */
  static assert(endpoint, params) {
    const { valid, errors } = VerteilValidator.validate(endpoint, params);
    if (!valid) {
      throw new Error(`Validation failed for "${endpoint}": ${errors.join('; ')}`);
    }
  }

  /**
   * Returns the raw schema for an endpoint.
   *
   * @param {string} endpoint
   * @returns {Object|null}
   */
  static getSchema(endpoint) {
    return SCHEMAS[endpoint] ?? null;
  }

  /**
   * Registers (or replaces) the schema for a custom endpoint.
   *
   * @param {string} endpoint
   * @param {Object} schema
   */
  static registerSchema(endpoint, schema) {
    SCHEMAS[endpoint] = schema;
  }

  // ── Engine ─────────────────────────────────────────────────────────────────

  /**
   * Recursive descent validator.
   *
   * This is a simplified JSON-Schema-like engine (no $ref, no oneOf/anyOf).
   * It walks the schema tree and the value tree simultaneously, collecting
   * all errors into the `errors` array rather than throwing on the first
   * violation.  That "collect-all" approach means callers receive a
   * complete list of problems in a single validate() call.
   *
   * Path tracking: `path` starts as the endpoint name (e.g. "airShopping")
   * and accumulates property names and array indices as we descend, producing
   * human-readable dot-notation paths like "airShopping.coreQuery.originDestinations[0].departureAirport".
   *
   * @private
   */
  static _check(value, schema, path, errors) {
    // ── Type check (always first) ────────────────────────────────────────────
    // If the value is the wrong type, skip all further checks for this node
    // because they would all fail with misleading messages (e.g. "string too short"
    // when the value is actually an array).
    if (schema.type) {
      const ok = VerteilValidator._checkType(value, schema.type);
      if (!ok) {
        errors.push(`"${path}" must be of type ${schema.type}, got ${typeof value}`);
        return; // no point checking further
      }
    }

    // ── Enum check ────────────────────────────────────────────────────────────
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`"${path}" must be one of [${schema.enum.join(', ')}], got "${value}"`);
    }

    // ── Pattern check (string only) ───────────────────────────────────────────
    // Used for airport codes (^[A-Z]{3}$), dates (^\d{4}-\d{2}-\d{2}$), etc.
    if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
      errors.push(`"${path}" does not match pattern ${schema.pattern}`);
    }

    // ── String length checks ──────────────────────────────────────────────────
    if (typeof schema.minLength === 'number' && typeof value === 'string' && value.length < schema.minLength) {
      errors.push(`"${path}" must be at least ${schema.minLength} characters`);
    }

    if (typeof schema.maxLength === 'number' && typeof value === 'string' && value.length > schema.maxLength) {
      errors.push(`"${path}" must be at most ${schema.maxLength} characters`);
    }

    // ── Array length checks ───────────────────────────────────────────────────
    if (typeof schema.minItems === 'number' && Array.isArray(value) && value.length < schema.minItems) {
      errors.push(`"${path}" must have at least ${schema.minItems} item(s)`);
    }

    // ── Required properties (object only) ────────────────────────────────────
    // We use == null (not === undefined) to catch both undefined and null,
    // since the NDC layer sometimes explicitly sets fields to null.
    if (schema.required && typeof value === 'object' && value !== null) {
      for (const key of schema.required) {
        if (value[key] == null) {
          errors.push(`"${path}.${key}" is required`);
        }
      }
    }

    // ── Recurse into object properties ────────────────────────────────────────
    // Only validate properties that are explicitly listed in the schema AND
    // present in the value object.  Extra (unknown) properties are silently
    // ignored — we intentionally do not enforce strict (no-additional-properties)
    // because the Verteil NDC payload shape can vary across airline implementations.
    if (schema.properties && typeof value === 'object' && value !== null) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (value[key] != null) {
          VerteilValidator._check(value[key], subSchema, `${path}.${key}`, errors);
        }
      }
    }

    // ── Recurse into array items ──────────────────────────────────────────────
    // Validates each element in the array against the `items` sub-schema.
    // Index is included in the path for precise error location (e.g. "[0]").
    if (schema.items && Array.isArray(value)) {
      value.forEach((item, i) =>
        VerteilValidator._check(item, schema.items, `${path}[${i}]`, errors),
      );
    }
  }

  /**
   * Type checker that handles the JavaScript typeof quirks:
   *  - `typeof null === 'object'` (we exclude null for schema type 'object')
   *  - `typeof [] === 'object'`   (we use Array.isArray for schema type 'array')
   *
   * @private
   */
  static _checkType(value, type) {
    switch (type) {
      case 'object':  return value !== null && typeof value === 'object' && !Array.isArray(value);
      case 'array':   return Array.isArray(value);
      case 'string':  return typeof value === 'string';
      case 'number':  return typeof value === 'number';
      case 'boolean': return typeof value === 'boolean';
      default:        return true;  // unknown type keywords are permissive
    }
  }
}

export default VerteilValidator;
