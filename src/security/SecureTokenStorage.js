/**
 * @fileoverview Encrypted in-process token storage for the Verteil OAuth2
 * bearer token.
 *
 * Tokens are AES-256-GCM encrypted before being placed in an in-memory
 * TTL cache so that the raw token value is never held in plain text.
 * The default TTL is 55 minutes, which is slightly shorter than the
 * 60-minute Verteil token lifetime to account for clock skew.
 */

import NodeCache from 'node-cache';
import { encrypt, decrypt } from './encryptData.js';

const CACHE_KEY = 'verteil_token';

/**
 * Manages the Verteil API bearer token lifecycle.
 *
 * Responsibilities:
 *  - Encrypts the raw token before caching.
 *  - Decrypts on retrieval.
 *  - Exposes TTL-aware validity checks.
 *  - Supports configurable expiry (default: 55 minutes).
 *
 * @class SecureTokenStorage
 *
 * @example
 * const storage = new SecureTokenStorage();
 * storage.storeToken('eyJhbGci...');
 * if (storage.hasValidToken()) {
 *   const token = storage.retrieveToken();
 * }
 */
class SecureTokenStorage {
  /**
   * @param {number} [tokenExpiryMinutes=55] Token TTL in minutes.
   */
  constructor(tokenExpiryMinutes = 55) {
    /** @private @type {number} */
    this._tokenExpiry = tokenExpiryMinutes;

    /** @private @type {NodeCache} */
    this._cache = new NodeCache({ useClones: false });
  }

  /**
   * Encrypts and stores the bearer token with the configured TTL.
   *
   * @param {string} token Raw bearer token string.
   * @returns {void}
   */
  storeToken(token) {
    const encrypted = encrypt(token);
    this._cache.set(CACHE_KEY, encrypted, this._tokenExpiry * 60);
  }

  /**
   * Retrieves and decrypts the stored bearer token.
   *
   * @returns {string|null} Decrypted token, or `null` if absent / expired.
   */
  retrieveToken() {
    const encrypted = this._cache.get(CACHE_KEY);
    if (!encrypted) return null;
    return decrypt(encrypted);
  }

  /**
   * Returns `true` when a valid (non-expired, decryptable) token is cached.
   *
   * @returns {boolean}
   */
  hasValidToken() {
    return this._cache.has(CACHE_KEY) && this.retrieveToken() !== null;
  }

  /**
   * Removes the cached token, forcing re-authentication on the next request.
   *
   * @returns {void}
   */
  clearToken() {
    this._cache.del(CACHE_KEY);
  }

  /**
   * Returns the configured token TTL in minutes.
   *
   * @returns {number}
   */
  getTokenExpiry() {
    return this._tokenExpiry;
  }

  /**
   * Updates the token TTL.  Takes effect for the *next* {@link storeToken}
   * call; already-cached tokens are not affected.
   *
   * @param {number} minutes New TTL in minutes.
   * @returns {void}
   */
  setTokenExpiry(minutes) {
    this._tokenExpiry = minutes;
  }
}

export default SecureTokenStorage;
