/**
 * @fileoverview Input sanitization utilities used throughout the wrapper.
 * Strips HTML tags, removes null bytes, and normalises whitespace before
 * any user-supplied data is forwarded to the Verteil API.
 */

/**
 * Sanitizes a single string value.
 *
 * Steps applied (in order):
 *  1. Strip HTML / XML tags.
 *  2. Encode special HTML characters to prevent XSS if the string is later
 *     rendered in a web context.
 *  3. Remove null bytes (common injection vector).
 *  4. Normalise consecutive whitespace to a single space and trim.
 *
 * @param {string} value Raw input string.
 * @returns {string}     Sanitised string.
 */
function sanitizeString(value) {
  if (typeof value !== 'string') return value;

  // 1. Strip HTML / XML tags
  let result = value.replace(/<[^>]*>/g, '');

  // 2. Encode basic HTML entities
  result = result
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // 3. Remove null bytes
  result = result.replace(/\0/g, '');

  // 4. Normalise whitespace
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Recursively sanitizes all string values in a plain-object / array tree.
 *
 * Non-string leaf values (numbers, booleans, null) are passed through
 * unchanged.  Object references are not mutated — a new object/array is
 * returned at every level.
 *
 * @param {*} input Any value (object, array, primitive).
 * @returns {*}     Sanitised copy of the input.
 */
function sanitize(input) {
  if (Array.isArray(input)) {
    return input.map(sanitize);
  }

  if (input !== null && typeof input === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = sanitize(value);
    }
    return result;
  }

  if (typeof input === 'string') {
    return sanitizeString(input);
  }

  return input;
}

/**
 * Alias of {@link sanitize} — recursively sanitizes all string values in
 * a plain-object / array tree.  Provided for API symmetry with
 * `sanitizeString`.
 *
 * @param {Object|Array} input Object or array to sanitize.
 * @returns {Object|Array}     Sanitised copy.
 */
const sanitizeObject = sanitize;

/**
 * Validates that a string matches a given regular-expression pattern.
 *
 * @param {string} value   String to test.
 * @param {RegExp} pattern Regular expression to match against.
 * @returns {boolean}
 */
function validatePattern(value, pattern) {
  return pattern.test(value);
}

export { sanitize, sanitizeString, sanitizeObject, validatePattern };
