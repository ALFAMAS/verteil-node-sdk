/**
 * @fileoverview Static helper factory for building common Verteil NDC sub-objects.
 *
 * Each method returns a plain data object that can be embedded inside larger
 * request payloads such as FlightPrice, OrderCreate, etc.
 */

/**
 * @class VerteilRequestBuilder
 * @description Collection of static factory helpers for reusable NDC sub-structures.
 */
class VerteilRequestBuilder {
  /**
   * Builds a name object suitable for passenger Name fields.
   *
   * @param {string|string[]} given   - Given (first) name(s).
   * @param {string}          surname - Family name.
   * @param {string|null}     [title] - Honorific (MR, MRS, MISS, etc.).
   * @returns {{given: string[], surname: string, title: string|null}}
   */
  static createNameType(given, surname, title = null) {
    return {
      given:   Array.isArray(given) ? given : [given],
      surname: surname ?? '',
      title:   title ?? null,
    };
  }

  /**
   * Builds a contact object with phone, email, and postal address.
   *
   * @param {string} phoneNumber       - Local phone number digits.
   * @param {string} email             - E-mail address.
   * @param {string} street            - Street address line.
   * @param {string} city              - City name.
   * @param {string} postalCode        - Postal / ZIP code.
   * @param {string} countryCode       - ISO 3166-1 alpha-2 country code.
   * @param {string} [phoneCountryCode='1'] - International dialling prefix (digits only).
   * @returns {{phone: Object, email: string, address: Object}}
   */
  static createContactType(
    phoneNumber,
    email,
    street,
    city,
    postalCode,
    countryCode,
    phoneCountryCode = '1',
  ) {
    return {
      phone: {
        countryCode: phoneCountryCode,
        number:      phoneNumber,
      },
      email,
      address: {
        street,
        city,
        postalCode,
        countryCode,
      },
    };
  }

  /**
   * Builds a passenger travel document object.
   * Null / undefined fields are omitted from the returned object.
   *
   * @param {string}      documentNumber  - Passport / ID number.
   * @param {string}      issuingCountry  - ISO 3166-1 alpha-2 issuing country code.
   * @param {string}      [type='PT']     - Document type code (PT = passport).
   * @param {string|null} [expiryDate]    - Expiry date in YYYY-MM-DD format.
   * @returns {{type: string, number: string, country: string, expiryDate?: string}}
   */
  static createPassengerDocumentType(
    documentNumber,
    issuingCountry,
    type       = 'PT',
    expiryDate = null,
  ) {
    const doc = {
      type,
      number:     documentNumber,
      country:    issuingCountry,
      expiryDate,
    };
    return Object.fromEntries(Object.entries(doc).filter(([, v]) => v != null));
  }

  /**
   * Builds a payment-card object in the shape expected by OrderCreate payments.
   *
   * @param {string} cardNumber  - Full PAN.
   * @param {string} cvv         - Card security code.
   * @param {string} expiryDate  - Card expiry (MMYY or YYYY-MM format).
   * @param {string} holderName  - Cardholder full name.
   * @param {string} [brand='VI'] - Card brand code (VI, CA, AX, etc.).
   * @returns {{type: 'card', card: Object}}
   */
  static createPaymentCardType(
    cardNumber,
    cvv,
    expiryDate,
    holderName,
    brand = 'VI',
  ) {
    return {
      type: 'card',
      card: {
        number:     cardNumber,
        cvv,
        brand,
        expiry:     expiryDate,
        holderName,
      },
    };
  }

  /**
   * Builds a flight segment object.
   * Null / undefined optional fields are omitted from the returned object.
   *
   * @param {string}      departureAirport - IATA departure airport code.
   * @param {string}      arrivalAirport   - IATA arrival airport code.
   * @param {string}      departureDate    - Departure date (YYYY-MM-DD).
   * @param {string}      departureTime    - Departure time (HH:mm).
   * @param {string}      airlineCode      - IATA marketing carrier code.
   * @param {string}      flightNumber     - Flight number digits.
   * @param {string|null} [arrivalDate]    - Arrival date (YYYY-MM-DD).
   * @param {string|null} [arrivalTime]    - Arrival time (HH:mm).
   * @param {string|null} [classOfService] - RBD / booking class code.
   * @returns {Object} Flight segment data object.
   */
  static createFlightType(
    departureAirport,
    arrivalAirport,
    departureDate,
    departureTime,
    airlineCode,
    flightNumber,
    arrivalDate    = null,
    arrivalTime    = null,
    classOfService = null,
  ) {
    const flight = {
      departureAirport,
      arrivalAirport,
      departureDate,
      departureTime,
      arrivalDate,
      arrivalTime,
      airlineCode,
      flightNumber,
      classOfService,
    };
    return Object.fromEntries(Object.entries(flight).filter(([, v]) => v != null));
  }

  /**
   * Builds a price object with base amount, total tax, and currency.
   *
   * @param {number} baseAmount - Fare base amount (exclusive of taxes).
   * @param {number} taxAmount  - Total tax amount.
   * @param {string} currency   - ISO 4217 currency code.
   * @returns {{baseAmount: number, totalTax: number, currency: string}}
   */
  static createPriceType(baseAmount, taxAmount, currency) {
    return {
      baseAmount: baseAmount ?? 0.0,
      totalTax:   taxAmount  ?? 0.0,
      currency:   currency   ?? 'INR',
    };
  }
}

export default VerteilRequestBuilder;
