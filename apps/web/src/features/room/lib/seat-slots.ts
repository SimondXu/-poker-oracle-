import { ROOM_MAX_SEATS } from './practice-plan.ts';

/** Position of a seat as % of the table box. */
export interface SlotPoint {
  x: number;
  y: number;
}

export interface SeatSlot {
  /** Landscape (sm and up) and portrait (phone) positions. */
  wide: SlotPoint;
  tall: SlotPoint;
}

/**
 * Visual slots, clockwise from bottom center (the way the game table is laid out):
 * 0 bottom, 1 lower-left, 2 upper-left, 3 top, 4 upper-right, 5 lower-right.
 */
export const SEAT_SLOTS: readonly SeatSlot[] = [
  { wide: { x: 50, y: 89 }, tall: { x: 50, y: 91 } },
  { wide: { x: 13, y: 69 }, tall: { x: 22, y: 69 } },
  { wide: { x: 13, y: 31 }, tall: { x: 22, y: 31 } },
  { wide: { x: 50, y: 11 }, tall: { x: 50, y: 9 } },
  { wide: { x: 87, y: 31 }, tall: { x: 78, y: 31 } },
  { wide: { x: 87, y: 69 }, tall: { x: 78, y: 69 } },
];

/** The player's own seat sits at the bottom; `anchorSeat` is their seat index (0 until they are seated). */
export function seatToSlot(seatIndex: number, anchorSeat: number): number {
  return (seatIndex - anchorSeat + ROOM_MAX_SEATS) % ROOM_MAX_SEATS;
}

export function slotToSeat(slot: number, anchorSeat: number): number {
  return (slot + anchorSeat) % ROOM_MAX_SEATS;
}
