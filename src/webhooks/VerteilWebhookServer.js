/**
 * @fileoverview Webhook server for receiving Verteil push notifications.
 *
 * Listens for inbound HTTP POST requests from Verteil, validates the
 * HMAC-SHA256 signature, parses the NDC payload, and emits typed events:
 *
 *   - `order.changed`       — OrderChangeNotif payload
 *   - `schedule.changed`    — Schedule-change payload
 *   - `flight.cancelled`    — Flight-cancellation payload
 *   - `raw`                 — Every validated request, regardless of type
 *   - `error`               — Signature failures / parse errors
 *
 * Uses Node.js built-in `http` — no external dependencies.
 *
 * @example
 * import VerteilWebhookServer from './src/webhooks/VerteilWebhookServer.js';
 *
 * const server = new VerteilWebhookServer({
 *   secret:    process.env.VERTEIL_WEBHOOK_SECRET,
 *   port:      4000,
 *   path:      '/webhooks/verteil',
 * });
 *
 * server.on('order.changed', payload => { ... });
 * server.on('error',         err      => console.error(err));
 * await server.start();
 */

import http          from 'http';
import https         from 'https';
import crypto        from 'crypto';
import { EventEmitter } from 'events';

const EVENT_MAP = {
  OrderChangeNotif: 'order.changed',
  ScheduleChange:   'schedule.changed',
  FlightCancel:     'flight.cancelled',
};

/**
 * @class VerteilWebhookServer
 * @extends EventEmitter
 */
class VerteilWebhookServer extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {string}  [options.secret]          HMAC secret for signature validation.
   * @param {number}  [options.port=4000]       TCP port to listen on.
   * @param {string}  [options.path='/webhook'] URL path to accept POSTs on.
   * @param {string}  [options.signatureHeader='x-verteil-signature']  Header name.
   * @param {Object}  [options.tls]             TLS options — if supplied an HTTPS server is created.
   */
  constructor(options = {}) {
    super();
    this._secret    = options.secret ?? '';
    this._port      = options.port   ?? 4000;
    this._path      = options.path   ?? '/webhook';
    this._sigHeader = options.signatureHeader ?? 'x-verteil-signature';
    this._tls       = options.tls    ?? null;
    this._server    = null;
  }

  /**
   * Starts listening for webhook requests.
   *
   * @returns {Promise<void>} Resolves when the server is bound and listening.
   */
  start() {
    return new Promise((resolve, reject) => {
      const handler = (req, res) => this._handleRequest(req, res);

      this._server = this._tls
        ? https.createServer(this._tls, handler)
        : http.createServer(handler);

      this._server.once('error', reject);
      this._server.listen(this._port, () => resolve());
    });
  }

  /**
   * Gracefully stops the server.
   *
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve, reject) => {
      if (!this._server) return resolve();
      this._server.close(err => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Returns the listening port, or `null` if not started.
   *
   * @returns {number|null}
   */
  get port() {
    const addr = this._server?.address();
    return addr ? addr.port : null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** @private */
  async _handleRequest(req, res) {
    // Only accept POST — Verteil push notifications always use POST.
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      return res.end('Method Not Allowed');
    }

    // Ignore requests to any path other than the configured one.
    // The startsWith check also accepts path?query_string variants.
    if (req.url !== this._path && !req.url.startsWith(this._path + '?')) {
      res.writeHead(404);
      return res.end('Not Found');
    }

    // Accumulate the full request body before processing.
    // We need the raw bytes for HMAC verification (signing is always over the raw body
    // before any parsing, so we must not decode until after verification).
    let body;
    try {
      body = await this._readBody(req);
    } catch (err) {
      this.emit('error', new Error(`Failed to read request body: ${err.message}`));
      res.writeHead(400);
      return res.end('Bad Request');
    }

    // ── Signature verification ────────────────────────────────────────────────
    // If a secret was configured, every incoming request must carry a valid HMAC.
    // Skipping this check when no secret is set allows testing without a secret,
    // but production deployments should always configure one.
    if (this._secret) {
      const sig = req.headers[this._sigHeader];
      if (!this._verifySignature(body, sig)) {
        // Emit to the 'error' event (not throw) so EventEmitter listeners can log
        // or alert without crashing the server.
        this.emit('error', new Error(`Invalid webhook signature from ${req.socket.remoteAddress}`));
        res.writeHead(401);
        return res.end('Unauthorized');
      }
    }

    // Parse after verification — we deliberately do not parse until the signature
    // check passes to avoid JSON injection attacks from unauthenticated senders.
    let payload;
    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch (err) {
      this.emit('error', new Error(`JSON parse error: ${err.message}`));
      res.writeHead(400);
      return res.end('Bad Request');
    }

    // Acknowledge receipt to Verteil BEFORE emitting events.  Verteil will retry
    // if it does not receive a 2xx within its timeout window; sending 200 first
    // prevents duplicate deliveries caused by slow event listeners.
    res.writeHead(200);
    res.end('OK');

    // Emit 'raw' for every validated request so consumers can log all events
    // or handle types not covered by EVENT_MAP.
    this.emit('raw', payload);

    // Map the NDC notification type to a friendly event name.
    // If the type is not in EVENT_MAP, emit 'unknown' rather than silently dropping it.
    const type    = payload?.NotifType ?? payload?.type;
    const event   = EVENT_MAP[type] ?? 'unknown';
    if (event !== 'unknown') this.emit(event, payload);
    else this.emit('unknown', payload);
  }

  /** @private */
  _readBody(req) {
    // Collect all data chunks and concatenate at 'end'.
    // Using Buffer.concat is more efficient than string concatenation because
    // it avoids intermediate string re-allocation for each chunk.
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end',  ()    => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  /** @private */
  _verifySignature(body, sig) {
    if (!sig) return false;

    // Compute what the signature SHOULD be for this body.
    const expected = crypto
      .createHmac('sha256', this._secret)
      .update(body)  // body is a Buffer — HMAC over raw bytes before UTF-8 decode
      .digest('hex');

    try {
      // crypto.timingSafeEqual compares two Buffers in constant time, preventing
      // timing-side-channel attacks where an attacker measures response latency to
      // determine how many bytes of the signature matched.  A naive === comparison
      // short-circuits at the first differing byte, leaking timing information.
      // The replace() strips the optional "sha256=" prefix that some webhook providers
      // prepend (GitHub-style format).
      return crypto.timingSafeEqual(
        Buffer.from(sig.replace(/^sha256=/, ''), 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      // timingSafeEqual throws if the two buffers have different lengths.
      // That happens when the incoming sig is malformed — treat it as invalid.
      return false;
    }
  }
}

export default VerteilWebhookServer;
