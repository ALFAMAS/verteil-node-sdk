/**
 * @fileoverview Request class for the Verteil OrderCreate endpoint.
 *
 * Validates passenger, payment, and order-item parameters before forwarding
 * the serialised payload to `/entrygate/rest/request:orderCreate`.
 */



import BaseRequest from './BaseRequest.js';
import OrderCreate from '../dataTypes/OrderCreate.js';

const VALID_PTC          = ['ADT', 'CHD', 'INF'];
const VALID_DOC_TYPES    = ['PT', 'NI', 'ID', 'CR'];
const VALID_CARD_BRANDS  = ['AX', 'DS', 'DC', 'UP', 'JC', 'CA', 'TP', 'VI'];
const AIRLINE_RE         = /^[A-Z]{2}$/;
const CURRENCY_RE        = /^[A-Z]{3}$/;
const DATE_RE            = /^\d{4}-\d{2}-\d{2}$/;
const EXPIRY_RE          = /^(0[1-9]|1[0-2])\d{2}$/;
const CVV_RE             = /^\d{3,4}$/;
const EMAIL_RE           = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Constructs and validates an OrderCreate request.
 *
 * @class OrderCreateRequest
 * @extends BaseRequest
 */
class OrderCreateRequest extends BaseRequest {
  /**
   * @param {Object}      query         Core order query (orderItems, dataLists, passengers).
   * @param {Object|null} [party]       Corporate sender information.
   * @param {Array|null}  [payments]    Payment method(s).
   * @param {Array|null}  [commission]  Commission records.
   * @param {Object|null} [metadata]    Augmentation metadata.
   * @param {string|null} [thirdPartyId]
   * @param {string|null} [officeId]
   */
  constructor(
    query,
    party      = null,
    payments   = null,
    commission = null,
    metadata   = null,
    thirdPartyId = null,
    officeId   = null,
  ) {
    super({});
    this._query    = query;
    this._party    = party;
    this._payments = payments;
    this._commission = commission;
    this._metadata = metadata;
    this._officeId = officeId;

    const shoppingResponse = query?.orderItems?.shoppingResponse;
    this._thirdPartyId = thirdPartyId ?? shoppingResponse?.owner ?? null;
  }

  /** @returns {string} */
  getEndpoint() { return '/entrygate/rest/request:orderCreate'; }

  /** @returns {Object} */
  getHeaders() {
    const h = { service: 'OrderCreate' };
    if (this._thirdPartyId) h.ThirdpartyId = this._thirdPartyId;
    if (this._officeId)     h.OfficeId     = this._officeId;
    return h;
  }

  /**
   * Validates all sections of the request.
   * @throws {Error}
   */
  validate() {
    this._validateQuery();
    if (this._party)      this._validateParty();
    if (this._payments)   this._validatePayments();
    if (this._commission) this._validateCommission();
    if (this._metadata)   this._validateMetadata();
  }

  /** @returns {Object} NDC-compliant JSON payload. */
  toArray() {
    return OrderCreate.create({
      query:      this._query,
      party:      this._party,
      payments:   this._payments,
      commission: this._commission,
      metadata:   this._metadata,
    });
  }

  // ── Private validators ────────────────────────────────────────────────────

  /** @private */
  _validateQuery() {
    if (!this._query.orderItems || !this._query.dataLists || !this._query.passengers) {
      throw new Error('Query must contain orderItems, dataLists, and passengers');
    }
    this._validateOrderItems(this._query.orderItems);
    this._validateDataLists(this._query.dataLists);
    this._validatePassengers(this._query.passengers);
  }

  /** @private */
  _validateOrderItems(orderItems) {
    if (!orderItems.shoppingResponse || !orderItems.offerItem) {
      throw new Error('OrderItems must contain shoppingResponse and offerItem');
    }
    const sr = orderItems.shoppingResponse;
    if (!sr.owner || !sr.responseId || !sr.offers) {
      throw new Error('Invalid shopping response structure');
    }
  }

  /** @private */
  _validateDataLists(dataLists) {
    if (!dataLists.fares) throw new Error('DataLists must contain fare information');
    for (const fare of dataLists.fares) {
      if (!fare.listKey || !fare.code) throw new Error('Each fare must contain listKey and code');
    }
  }

  /** @private */
  _validatePassengers(passengers) {
    for (const p of passengers) {
      if (!p.objectKey || !p.passengerType || !p.gender || !p.name) {
        throw new Error('Invalid passenger structure');
      }
      if (!VALID_PTC.includes(p.passengerType)) {
        throw new Error(`Invalid passenger type: ${p.passengerType}`);
      }
      if (!p.name.given || !p.name.surname) {
        throw new Error('Passenger name must contain given name and surname');
      }
      if (p.contacts)  this._validatePassengerContacts(p.contacts);
      if (p.document)  this._validatePassengerDocument(p.document);
    }
  }

  /** @private */
  _validatePassengerContacts(contacts) {
    if (!contacts.phone || !contacts.email || !contacts.address) {
      throw new Error('Passenger contacts must contain phone, email, and address');
    }
    if (!contacts.phone.countryCode || !contacts.phone.number) {
      throw new Error('Phone contact must contain countryCode and number');
    }
    if (!EMAIL_RE.test(contacts.email)) throw new Error('Invalid email format');
    const a = contacts.address;
    if (!a.street || !a.postalCode || !a.city || !a.countryCode) {
      throw new Error('Address must contain street, postalCode, city, and countryCode');
    }
  }

  /** @private */
  _validatePassengerDocument(doc) {
    for (const f of ['type', 'number', 'issuingCountry']) {
      if (!doc[f]) throw new Error(`Document must contain ${f}`);
    }
    if (!VALID_DOC_TYPES.includes(doc.type)) throw new Error(`Invalid document type: ${doc.type}`);
    if (!AIRLINE_RE.test(doc.issuingCountry)) throw new Error('Invalid country code format in document');
    if (doc.expiryDate && !DATE_RE.test(doc.expiryDate)) throw new Error('Invalid expiry date format');
  }

  /** @private */
  _validateParty() {
    if (!this._party.corporateCode) throw new Error('Corporate code is required in party information');
    if (!/^[A-Z]{2}(\/[A-Z0-9]+)?(\/[A-Z0-9]+)?$/.test(this._party.corporateCode)) {
      throw new Error('Invalid corporate code format');
    }
    if (this._party.contact) {
      const c = this._party.contact;
      if (!c.email || !c.phoneCountryCode || !c.phoneNumber) {
        throw new Error('Party contact must contain email, phoneCountryCode, and phoneNumber');
      }
      if (!EMAIL_RE.test(c.email)) throw new Error('Invalid party contact email format');
    }
  }

  /** @private */
  _validatePayments() {
    for (const payment of this._payments) {
      if (!payment.amount || !payment.currency) throw new Error('Payment must contain amount and currency');
      if (isNaN(payment.amount) || Number(payment.amount) <= 0) {
        throw new Error('Payment amount must be a positive number');
      }
      if (!CURRENCY_RE.test(payment.currency)) throw new Error('Invalid currency code format');
      if (payment.card) {
        this._validatePaymentCard(payment.card);
      } else if (payment.cash == null && payment.other == null) {
        throw new Error('Invalid payment method. Must be card, cash, or other');
      }
    }
  }

  /** @private */
  _validatePaymentCard(card) {
    for (const f of ['number', 'expiryDate', 'brand']) {
      if (!card[f]) throw new Error(`Card must contain ${f}`);
    }
    if (!VALID_CARD_BRANDS.includes(card.brand)) throw new Error('Invalid card brand');
    if (!EXPIRY_RE.test(card.expiryDate)) throw new Error('Invalid card expiry date format (MMYY)');
    if (card.cvv && !CVV_RE.test(card.cvv)) throw new Error('Invalid CVV format');
  }

  /** @private */
  _validateCommission() {
    for (const comm of this._commission) {
      if (!comm.amount || !comm.currency || !comm.code) {
        throw new Error('Commission must contain amount, currency, and code');
      }
      if (!CURRENCY_RE.test(comm.currency)) throw new Error('Invalid commission currency code format');
    }
  }

  /** @private */
  _validateMetadata() { /* pass — deep structure is optional */ }
}

export default OrderCreateRequest;
