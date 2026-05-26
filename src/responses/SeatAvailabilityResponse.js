/**
 * @fileoverview Response class for the Verteil SeatAvailability endpoint.
 *
 * Provides typed accessors for seat data, flight segments, and cabin layout
 * extracted from the raw NDC JSON payload.
 */



import BaseResponse from './BaseResponse.js';

/**
 * @class SeatAvailabilityResponse
 * @extends BaseResponse
 */
class SeatAvailabilityResponse extends BaseResponse {
  /**
   * @param {Object} data Raw NDC response body.
   */
  constructor(data) {
    super(data);
  }

  /**
   * Returns all available seat entries from the SeatList data list.
   * @returns {Array}
   */
  getAvailableSeats() {
    return this.data?.DataLists?.SeatList?.Seats ?? [];
  }

  /**
   * Returns flight segment details from the FlightSegmentList data list.
   * @returns {Array}
   */
  getFlightSegments() {
    return this.data?.DataLists?.FlightSegmentList?.FlightSegment ?? [];
  }

  /**
   * Returns the cabin layout for the first flight in the response.
   * @returns {Array}
   */
  getCabinLayout() {
    return this.data?.Flights?.[0]?.Cabin ?? [];
  }

  /**
   * Converts the raw seat-availability payload into a structured 2-D grid
   * keyed by segment, ready to feed a front-end seat-picker component.
   *
   * @returns {Object.<string, {columns: string[], rows: Array<{number: string, seats: Array}>}>}
   */
  toGrid() {
    const flights = this.data?.ALaCarteOfferList?.ALaCarteOffer
      ?? this.data?.Flights
      ?? [];

    const seatList = this.getAvailableSeats();
    const seatMap  = new Map(
      seatList.map(s => [`${s.Column}${s.Row?.Number?.value ?? s.RowNumber}`, s]),
    );

    const grid = {};

    const cabins = this.data?.DataLists?.CabinList?.Cabin
      ?? this.data?.Flights?.flatMap(f => f.Cabin ?? [])
      ?? [];

    cabins.forEach(cabin => {
      const segKey = cabin.SegmentRef ?? cabin.FlightSegmentKey ?? 'default';
      if (!grid[segKey]) {
        grid[segKey] = { columns: [], rows: [] };
      }

      const columns = (cabin.CabinLayout?.Columns?.Column ?? []).map(c => c.Position ?? c);
      if (!grid[segKey].columns.length) grid[segKey].columns = columns;

      const rowDefs = cabin.CabinLayout?.Rows?.Row ?? [];
      rowDefs.forEach(rowDef => {
        const rowNum = String(rowDef.Number?.value ?? rowDef.Number ?? '');
        const seats  = columns.map(col => {
          const seatKey = `${col}${rowNum}`;
          const raw     = seatMap.get(seatKey) ?? rowDef.Seat?.find?.(
            s => (s.Column ?? '') === col,
          );

          return {
            column:       col,
            row:          rowNum,
            available:    raw?.SeatStatus?.value !== 'Occupied' && raw?.SeatStatus !== 'Occupied',
            type:         raw?.SeatType ?? null,
            price:        raw?.ALaCartePrice ?? null,
            restrictions: (raw?.SeatCharacteristicCode ?? []).map(c => c.value ?? c),
          };
        });

        grid[segKey].rows.push({ number: rowNum, seats });
      });
    });

    return grid;
  }
}

export default SeatAvailabilityResponse;
