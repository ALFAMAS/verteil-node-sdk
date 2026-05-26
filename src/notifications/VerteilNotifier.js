/**
 * @fileoverview Alert notification dispatcher for critical Verteil API events.
 *
 * Supports Slack (via incoming webhook) and generic HTTP email-relay endpoints.
 * Only notifications with level `'emergency'`, `'alert'`, or `'critical'` are
 * dispatched; lower-severity events are silently ignored.
 *
 * Configure via the options object passed to the constructor.
 */

import https from 'https';
import http from 'http';

const NOTIFICATION_LEVELS = new Set(['emergency', 'alert', 'critical']);

/**
 * Dispatches high-severity alerts to Slack and/or an email relay.
 *
 * @class VerteilNotifier
 *
 * @example
 * const notifier = new VerteilNotifier({
 *   slackWebhookUrl:  process.env.VERTEIL_SLACK_WEBHOOK,
 *   notificationEmail: process.env.VERTEIL_NOTIFICATION_EMAIL,
 * });
 * await notifier.notify('critical', 'Rate limit exceeded', { endpoint: 'airShopping' });
 */
class VerteilNotifier {
  /**
   * @param {object} [config]
   * @param {string} [config.slackWebhookUrl]     Slack incoming-webhook URL.
   * @param {string} [config.notificationEmail]   Recipient email address for alerts.
   * @param {string} [config.emailRelayUrl]       HTTP(S) endpoint that accepts
   *   `{ to, subject, body }` POST requests for sending email.
   */
  constructor(config = {}) {
    /** @private */
    this._config = config;
  }

  /**
   * Dispatches a notification to all configured channels.
   *
   * Only levels `'emergency'`, `'alert'`, and `'critical'` are forwarded.
   *
   * @param {string} level    Severity level.
   * @param {string} message  Human-readable description.
   * @param {Object} [ctx]    Additional key-value context.
   * @returns {Promise<void>}
   */
  async notify(level, message, ctx = {}) {
    if (!NOTIFICATION_LEVELS.has(level)) return;

    await Promise.allSettled([
      this._sendSlack(level, message, ctx),
      this._sendEmail(level, message, ctx),
    ]);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Sends a Slack notification via incoming webhook.
   *
   * @private
   */
  async _sendSlack(level, message, ctx) {
    const url = this._config.slackWebhookUrl;
    if (!url) return;

    const payload = JSON.stringify({
      text: `*[${level.toUpperCase()}]* ${message}`,
      attachments: [
        {
          color: level === 'emergency' ? 'danger' : 'warning',
          fields: Object.entries(ctx).map(([k, v]) => ({
            title: k,
            value: String(v),
            short: true,
          })),
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });

    await this._post(url, payload);
  }

  /**
   * Sends an email notification via a configurable HTTP relay endpoint.
   *
   * @private
   */
  async _sendEmail(level, message, ctx) {
    const email    = this._config.notificationEmail;
    const relayUrl = this._config.emailRelayUrl;
    if (!email || !relayUrl) return;

    const payload = JSON.stringify({
      to:      email,
      subject: `[Verteil ${level.toUpperCase()}] ${message}`,
      body:    JSON.stringify(ctx, null, 2),
    });

    await this._post(relayUrl, payload);
  }

  /**
   * Thin HTTP POST helper (no external dependency on axios here).
   *
   * @private
   * @param {string} urlStr  Full URL to POST to.
   * @param {string} body    JSON string body.
   * @returns {Promise<void>}
   */
  _post(urlStr, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const lib  = url.protocol === 'https:' ? https : http;

      const req = lib.request(
        {
          hostname: url.hostname,
          port:     url.port || (url.protocol === 'https:' ? 443 : 80),
          path:     url.pathname + url.search,
          method:   'POST',
          headers:  {
            'Content-Type':   'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        res => {
          res.resume();
          res.on('end', resolve);
        },
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

export default VerteilNotifier;
