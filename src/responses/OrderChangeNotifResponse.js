/**
 * @fileoverview Response class for the Verteil OrderChangeNotif endpoint.
 *
 * Parses acknowledgement, status, errors, warnings, and identifiers from
 * the raw NDC response returned after sending a schedule-change notification.
 */



import BaseResponse from './BaseResponse.js';

/**
 * @class OrderChangeNotifResponse
 * @extends BaseResponse
 */
class OrderChangeNotifResponse extends BaseResponse {
  /**
   * @param {Object} data Raw NDC response body.
   */
  constructor(data) {
    super(data);
  }

  /**
   * Returns `true` when the airline acknowledged the notification with `'OK'`.
   * @returns {boolean}
   */
  isAcknowledged() {
    return this.data?.Response?.Acknowledgement?.value === 'OK';
  }

  /**
   * Returns the notification processing status string.
   * @returns {string}
   */
  getStatus() {
    return this.data?.Response?.Status ?? '';
  }

  /**
   * Returns parsed error objects from the Errors block.
   * @returns {Array<{code:string, type:string, description:string, status:string, tag:string|null}>}
   */
  getErrors() {
    return (this.data?.Response?.Errors ?? []).map(e => ({
      code:        e.Code        ?? '',
      type:        e.Type        ?? '',
      description: e.Description ?? '',
      status:      e.Status      ?? '',
      tag:         e.Tag         ?? null,
    }));
  }

  /**
   * Returns parsed warning objects from the Warnings block.
   * @returns {Array<{code:string, type:string, description:string, severity:string}>}
   */
  getWarnings() {
    return (this.data?.Response?.Warnings ?? []).map(w => ({
      code:        w.Code        ?? '',
      type:        w.Type        ?? '',
      description: w.Description ?? '',
      severity:    w.Severity    ?? 'Info',
    }));
  }

  /**
   * Returns the ISO-8601 response timestamp.
   * @returns {string|null}
   */
  getTimestamp() {
    return this.data?.Response?.Timestamp ?? null;
  }

  /**
   * Returns the correlation ID linking this notification to a prior request.
   * @returns {string|null}
   */
  getCorrelationId() {
    return this.data?.Response?.CorrelationID ?? null;
  }
}

export default OrderChangeNotifResponse;
