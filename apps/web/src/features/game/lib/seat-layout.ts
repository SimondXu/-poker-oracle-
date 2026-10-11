/**
 * Seat layout for the v2 table stage (pure, no React).
 *
 * All coordinates are percentages of the table stage box: `x` of its width,
 * `y` of its height. The stage keeps a fixed aspect ratio per orientation
 * (landscape 16:9 on tablets/desktop, portrait on phones), so distances are
 * compared in "aspect-corrected" units (y scaled by 1/aspect).
 *
 * Seats are placed from hand-tuned tables per player count. Visual slot 0 is
 * bottom center (the hero, or seat 0 when spectating); slots continue
 * clockwise on screen: bottom → left → top → right, the way action moves in
 * a real online client (the next seat sits to the hero's left).
 *
 * Element sizes (plate, cards, bet bubble, dealer button) live in
 * `TableGeometry.metrics` in em of the stage font-size. The components size
 * themselves from the same numbers, and `getSeatFootprint` turns them into
 * stage-percent boxes so bets/buttons can be placed clear of the seat and the
 * tests can assert that nothing overlaps.
 */

export interface LayoutPoint {
  /** Percent of stage width, 0..100. */
  x: number;
  /** Percent of stage height, 0..100. */
  y: number;
}

export interface LayoutBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SeatLayout {
  /** Center of the seat plate (on the rail). */
  seat: LayoutPoint;
  /** Center of the bet chip bubble, between seat and table center. */
  bet: LayoutPoint;
  /** Center of the dealer button, beside the plate on the side facing the table center. */
  button: LayoutPoint;
  /** Hole cards peek above the plate (false for the top row: cards go below, toward the felt). */
  cardsAbove: boolean;
  /** Bottom-center slot (hero, or seat 0 when spectating): bigger plate and cards. */
  isAnchor: boolean;
}

export type TableOrientation = 'landscape' | 'portrait';

/** Element sizes in em of the stage font-size. Card boxes are 2.5 × 3.5 of their own font-size. */
export interface SeatMetrics {
  plate: { w: number; h: number };
  heroPlate: { w: number; h: number };
  /** Plate text sizes (name line, stack line). */
  nameText: number;
  stackText: number;
  /** Card font-size for opponents' hole cards. */
  seatCard: number;
  /** Card font-size for the hero's hole cards. */
  heroCard: number;
  /** Card font-size for the board. */
  boardCard: number;
  /** Gap between board cards. */
  boardGap: number;
  /** Gap between an opponent's two hole cards. */
  seatCardGap: number;
  /** How far the hero's two fanned cards overlap each other. */
  heroCardFanOverlap: number;
  /** How far hole cards tuck under the plate. */
  seatCardTuck: number;
  heroCardTuck: number;
  /** Opponents' face-down backs are drawn (false on compact phone layout: plate only). */
  showFaceDownBacks: boolean;
  /** Nominal bet bubble (fits "12,345"). */
  bet: { w: number; h: number };
  /** Dealer button diameter. */
  button: number;
  /** Nominal last-action / hand-name tag box (opposite side of the cards). */
  tag: { w: number; h: number };
  /** Gap between the plate and its tag. */
  tagGap: number;
  /** Pot pill box. */
  pot: { w: number; h: number };
}

export interface TableGeometry {
  orientation: TableOrientation;
  /** Stage width / height. */
  aspect: number;
  center: LayoutPoint;
  /** Felt oval, stage percent. The rail is drawn just outside it. */
  felt: { cx: number; cy: number; rx: number; ry: number };
  /** Rail thickness in percent of stage width (y is aspect-corrected when drawn). */
  railPct: number;
  /** Ellipse the seat plates sit on (≈ middle of the rail). */
  seatRing: { rx: number; ry: number };
  /** Nominal 1em in percent of stage width (stage font-size = emPct% of its width, clamped to fontPx). */
  emPct: number;
  fontPx: { min: number; max: number };
  /** Seats above this y put their cards below the plate. */
  topRowMaxY: number;
  /** Compact phone layout: plate-only opponents. */
  compact: boolean;
  metrics: SeatMetrics;
}

/** Width / height of the landscape table stage box. */
export const TABLE_STAGE_ASPECT = 16 / 9;
/** Width / height of the portrait (phone) table stage box. */
export const TABLE_STAGE_PORTRAIT_ASPECT = 0.6;

const LANDSCAPE_METRICS: SeatMetrics = {
  plate: { w: 8.5, h: 2.9 },
  heroPlate: { w: 11, h: 3.2 },
  nameText: 0.8,
  stackText: 0.95,
  seatCard: 0.875,
  heroCard: 2.1,
  boardCard: 1.5,
  boardGap: 0.35,
  seatCardGap: 0.15,
  heroCardFanOverlap: 0.6,
  seatCardTuck: 0.3,
  heroCardTuck: 0.35,
  showFaceDownBacks: true,
  bet: { w: 3.8, h: 1.25 },
  button: 1.2,
  tag: { w: 6.5, h: 1.3 },
  tagGap: 0.3,
  pot: { w: 5, h: 1.5 },
};

const PORTRAIT_METRICS: SeatMetrics = {
  plate: { w: 7.2, h: 2.9 },
  heroPlate: { w: 10, h: 3.2 },
  nameText: 0.95,
  stackText: 1.05,
  seatCard: 0.8,
  heroCard: 1.9,
  boardCard: 1.15,
  boardGap: 0.25,
  seatCardGap: 0.12,
  heroCardFanOverlap: 0.5,
  seatCardTuck: 0.25,
  heroCardTuck: 0.3,
  showFaceDownBacks: false,
  bet: { w: 3.8, h: 1.25 },
  button: 1.2,
  tag: { w: 6.5, h: 1.3 },
  tagGap: 0.3,
  pot: { w: 5, h: 1.5 },
};

export const TABLE_GEOMETRIES: Readonly<Record<TableOrientation, TableGeometry>> = {
  landscape: {
    orientation: 'landscape',
    aspect: TABLE_STAGE_ASPECT,
    center: { x: 50, y: 48 },
    felt: { cx: 50, cy: 48, rx: 40, ry: 35 },
    railPct: 2.2,
    seatRing: { rx: 41.1, ry: 37 },
    emPct: 1.45,
    fontPx: { min: 6, max: 18 },
    topRowMaxY: 25,
    compact: false,
    metrics: LANDSCAPE_METRICS,
  },
  portrait: {
    orientation: 'portrait',
    aspect: TABLE_STAGE_PORTRAIT_ASPECT,
    center: { x: 50, y: 46 },
    felt: { cx: 50, cy: 46, rx: 38, ry: 37 },
    railPct: 3,
    seatRing: { rx: 40, ry: 39 },
    emPct: 2.6,
    fontPx: { min: 7, max: 14 },
    topRowMaxY: 25,
    compact: true,
    metrics: PORTRAIT_METRICS,
  },
};

/** Landscape geometry (kept for callers that predate orientations). */
export const TABLE_GEOMETRY = TABLE_GEOMETRIES.landscape;

export const MIN_LAYOUT_SEATS = 2;
export const MAX_TUNED_LAYOUT_SEATS = 10;

/** Preferred fraction of the seat→center segment where the bet bubble sits (pushed further only to clear the seat). */
export const BET_DISTANCE_RATIO = 0.4;
const MAX_BET_DISTANCE_RATIO = 0.8;
/** Gap between the plate and hole cards hanging below it (top-row seats), in em. */
export const CARDS_BELOW_GAP_EM = 0.15;
/** Card highlight raise, in card em (matches Card's -translate-y-[0.3em]). */
const CARD_HIGHLIGHT_RAISE = 0.3;
/** Clear space kept around boxes when placing bets/buttons, in em. */
const CLEARANCE_EM = 0.25;

type Pt = readonly [x: number, y: number];

/** Visual slot order: [bottom center, then clockwise on screen]. */
const LANDSCAPE_TABLES: Readonly<Record<number, readonly Pt[]>> = {
  2: [[50, 88], [50, 11]],
  3: [[50, 88], [12, 32], [88, 32]],
  4: [[50, 88], [9, 48], [50, 11], [91, 48]],
  5: [[50, 88], [11, 64], [27, 15], [73, 15], [89, 64]],
  6: [[50, 88], [12, 70], [12, 29], [50, 11], [88, 29], [88, 70]],
  7: [[50, 88], [18, 77], [9, 45], [29, 14], [71, 14], [91, 45], [82, 77]],
  8: [[50, 88], [24, 78], [9, 56], [15, 23], [50, 11], [85, 23], [91, 56], [76, 78]],
  9: [[50, 88], [25, 78], [9, 59], [12, 28], [34, 12], [66, 12], [88, 28], [91, 59], [75, 78]],
  10: [
    [50, 88], [27, 79], [10, 63], [9, 38], [22, 17],
    [50, 11], [78, 17], [91, 38], [90, 63], [73, 79],
  ],
};

const PORTRAIT_TABLES: Readonly<Record<number, readonly Pt[]>> = {
  2: [[50, 88], [50, 8]],
  3: [[50, 88], [14, 28], [86, 28]],
  4: [[50, 88], [11, 46], [50, 8], [89, 46]],
  5: [[50, 88], [13, 64], [24, 14], [76, 14], [87, 64]],
  6: [[50, 88], [15, 70], [11, 36], [50, 8], [89, 36], [85, 70]],
  7: [[50, 88], [17, 73], [11, 48], [22, 16], [78, 16], [89, 48], [83, 73]],
  8: [[50, 88], [19, 76], [11, 54], [12, 31], [50, 8], [88, 31], [89, 54], [81, 76]],
  9: [[50, 88], [20, 77], [11, 57], [11, 36], [30, 10], [70, 10], [89, 36], [89, 57], [80, 77]],
  10: [
    [50, 88], [21, 77], [11, 61], [11, 43], [18, 23],
    [50, 8], [82, 23], [89, 43], [89, 61], [79, 77],
  ],
};

const SEAT_TABLES: Readonly<Record<TableOrientation, Readonly<Record<number, readonly Pt[]>>>> = {
  landscape: LANDSCAPE_TABLES,
  portrait: PORTRAIT_TABLES,
};

const layoutCache = new Map<string, readonly SeatLayout[]>();

/** Clamp the server's maxSeats to what the layout supports (≥ 2). */
export function normalizeSeatCount(maxSeats: number): number {
  if (!Number.isFinite(maxSeats)) {
    return MIN_LAYOUT_SEATS;
  }
  return Math.max(MIN_LAYOUT_SEATS, Math.floor(maxSeats));
}

/**
 * Visual slot of a seat: 0 = bottom center, increasing clockwise on screen.
 * `anchorSeatIndex` is the seat shown at bottom center.
 */
export function getVisualSlot(seatIndex: number, seatCount: number, anchorSeatIndex: number): number {
  return (((seatIndex - anchorSeatIndex) % seatCount) + seatCount) % seatCount;
}

/**
 * Layout for every seat index `0..seatCount-1` (array index = seatIndex).
 * Hero (or seat 0 when `heroSeatIndex` is null) sits at bottom center.
 * Results are cached and frozen, so the same inputs return the same reference.
 */
export function getSeatLayouts(
  maxSeats: number,
  heroSeatIndex: number | null,
  orientation: TableOrientation = 'landscape',
): readonly SeatLayout[] {
  const seatCount = normalizeSeatCount(maxSeats);
  const anchor = heroSeatIndex !== null && heroSeatIndex >= 0 && heroSeatIndex < seatCount ? heroSeatIndex : 0;
  const cacheKey = `${orientation}:${seatCount}:${anchor}`;
  const cached = layoutCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const geometry = TABLE_GEOMETRIES[orientation];
  const slotLayouts = getSlotLayouts(seatCount, geometry);
  const layouts = Object.freeze(
    Array.from({ length: seatCount }, (_, seatIndex) => {
      const slot = getVisualSlot(seatIndex, seatCount, anchor);
      return slotLayouts[slot] ?? slotLayouts[0]!;
    }),
  );

  layoutCache.set(cacheKey, layouts);
  return layouts;
}

const slotCache = new Map<string, readonly SeatLayout[]>();

function getSlotLayouts(seatCount: number, geometry: TableGeometry): readonly SeatLayout[] {
  const cacheKey = `${geometry.orientation}:${seatCount}`;
  const cached = slotCache.get(cacheKey);
  if (cached) return cached;
  const points = SEAT_TABLES[geometry.orientation][seatCount] ?? buildEllipseFallback(seatCount, geometry);
  const layouts = points.map((point, slot) => buildSeatLayout(point, slot === 0, geometry));
  slotCache.set(cacheKey, layouts);
  return layouts;
}

/** Even spacing on the seat ring for counts beyond the tuned tables (> 10). */
function buildEllipseFallback(seatCount: number, geometry: TableGeometry): Pt[] {
  const { center, seatRing } = geometry;
  return Array.from({ length: seatCount }, (_, slot) => {
    // Start at bottom (π/2) and move clockwise on screen (toward the left first).
    const angle = Math.PI / 2 + (2 * Math.PI * slot) / seatCount;
    return [
      round1(center.x + seatRing.rx * Math.cos(angle)),
      round1(center.y + seatRing.ry * Math.sin(angle)),
    ] as const;
  });
}

// ─────────────────────────────────────────────
// Footprints (stage-percent boxes from em metrics)
// ─────────────────────────────────────────────

function emX(geometry: TableGeometry, em: number): number {
  return em * geometry.emPct;
}

function emY(geometry: TableGeometry, em: number): number {
  return em * geometry.emPct * geometry.aspect;
}

function boxAround(point: LayoutPoint, geometry: TableGeometry, wEm: number, hEm: number): LayoutBox {
  const halfW = emX(geometry, wEm) / 2;
  const halfH = emY(geometry, hEm) / 2;
  return { left: point.x - halfW, right: point.x + halfW, top: point.y - halfH, bottom: point.y + halfH };
}

export interface SeatFootprint {
  plate: LayoutBox;
  /** Hole cards box (null when this seat draws no cards). */
  cards: LayoutBox | null;
  /** Last-action / hand-name tag slot (opposite side of the cards). */
  tag: LayoutBox;
}

/** Width of a seat's two hole cards, in em. */
export function getHoleCardsWidthEm(metrics: SeatMetrics, isAnchor: boolean): number {
  return isAnchor
    ? 2 * 2.5 * metrics.heroCard - metrics.heroCardFanOverlap
    : 2 * 2.5 * metrics.seatCard + metrics.seatCardGap;
}

export function getSeatFootprint(
  layout: Pick<SeatLayout, 'seat' | 'cardsAbove' | 'isAnchor'>,
  geometry: TableGeometry,
  hasCards = true,
): SeatFootprint {
  const { metrics } = geometry;
  const plateSize = layout.isAnchor ? metrics.heroPlate : metrics.plate;
  const plate = boxAround(layout.seat, geometry, plateSize.w, plateSize.h);

  let cards: LayoutBox | null = null;
  if (hasCards) {
    const cardFont = layout.isAnchor ? metrics.heroCard : metrics.seatCard;
    const tuck = emY(geometry, layout.isAnchor ? metrics.heroCardTuck : metrics.seatCardTuck);
    const height = emY(geometry, 3.5 * cardFont);
    const halfW = emX(geometry, getHoleCardsWidthEm(metrics, layout.isAnchor)) / 2;
    // The hero's fanned cards lift their outer corners by about sin(4°) × card width.
    const fanLift = layout.isAnchor ? emY(geometry, 0.4) : 0;
    // Top-row cards hang below the plate with a small gap (their rank is at the top, so they
    // must not tuck under it) and drop by their highlight raise instead of lifting.
    const raise = layout.cardsAbove ? 0 : emY(geometry, CARD_HIGHLIGHT_RAISE * cardFont);
    const top = layout.cardsAbove ? plate.top + tuck - height - fanLift : plate.bottom + emY(geometry, CARDS_BELOW_GAP_EM);
    cards = { left: layout.seat.x - halfW, right: layout.seat.x + halfW, top, bottom: top + height + fanLift + raise };
  }

  const tagHalfW = emX(geometry, metrics.tag.w) / 2;
  const tagGap = emY(geometry, metrics.tagGap);
  const tagH = emY(geometry, metrics.tag.h);
  const tagTop = layout.cardsAbove ? plate.bottom + tagGap : plate.top - tagGap - tagH;
  const tag = { left: layout.seat.x - tagHalfW, right: layout.seat.x + tagHalfW, top: tagTop, bottom: tagTop + tagH };

  return { plate, cards, tag };
}

export function getBetBox(point: LayoutPoint, geometry: TableGeometry): LayoutBox {
  return boxAround(point, geometry, geometry.metrics.bet.w, geometry.metrics.bet.h);
}

export function getButtonBox(point: LayoutPoint, geometry: TableGeometry): LayoutBox {
  return boxAround(point, geometry, geometry.metrics.button, geometry.metrics.button);
}

/** Board width/height in em (5 card slots). */
export function getBoardSizeEm(metrics: SeatMetrics): { w: number; h: number } {
  return { w: 5 * 2.5 * metrics.boardCard + 4 * metrics.boardGap, h: 3.5 * metrics.boardCard };
}

export function getBoardBox(geometry: TableGeometry): LayoutBox {
  const size = getBoardSizeEm(geometry.metrics);
  return boxAround(geometry.center, geometry, size.w, size.h);
}

/** Center of the pot pill: just above the board. */
export function getPotPoint(geometry: TableGeometry): LayoutPoint {
  const board = getBoardBox(geometry);
  return { x: geometry.center.x, y: round1(board.top - emY(geometry, 0.5 + geometry.metrics.pot.h / 2)) };
}

export function getPotBox(geometry: TableGeometry): LayoutBox {
  return boxAround(getPotPoint(geometry), geometry, geometry.metrics.pot.w, geometry.metrics.pot.h);
}

export function boxesOverlap(a: LayoutBox, b: LayoutBox, margin = 0): boolean {
  return a.left < b.right + margin && b.left < a.right + margin && a.top < b.bottom + margin && b.top < a.bottom + margin;
}

// ─────────────────────────────────────────────
// Bet / button placement
// ─────────────────────────────────────────────

function buildSeatLayout([x, y]: Pt, isAnchor: boolean, geometry: TableGeometry): SeatLayout {
  const seat = { x, y };
  const cardsAbove = isAnchor || y > geometry.topRowMaxY;
  const footprint = getSeatFootprint({ seat, cardsAbove, isAnchor }, geometry);
  const own = [footprint.plate, footprint.cards!];
  const bet = placeBet(seat, own, geometry);
  const button = placeButton(seat, isAnchor, [...own, getBetBox(bet, geometry)], geometry);

  return Object.freeze({
    seat: Object.freeze(seat),
    bet: Object.freeze(bet),
    button: Object.freeze(button),
    cardsAbove,
    isAnchor,
  });
}

/**
 * Bet bubble: BET_DISTANCE_RATIO along seat→center, pushed further toward the
 * center only as far as needed to clear the seat's own plate and cards, then
 * nudged vertically off the board/pot if it would sit on them.
 */
function placeBet(seat: LayoutPoint, own: readonly LayoutBox[], geometry: TableGeometry): LayoutPoint {
  const { center } = geometry;
  const margin = emX(geometry, CLEARANCE_EM);
  let ratio = BET_DISTANCE_RATIO;
  let bet = lerp(seat, center, ratio);
  while (ratio < MAX_BET_DISTANCE_RATIO && own.some((box) => boxesOverlap(getBetBox(bet, geometry), box, margin))) {
    ratio += 0.02;
    bet = lerp(seat, center, ratio);
  }

  const blockers = [getBoardBox(geometry), getPotBox(geometry)];
  const direction = bet.y <= center.y ? -1 : 1;
  const step = emY(geometry, 0.25);
  for (let i = 0; i < 40 && blockers.some((box) => boxesOverlap(getBetBox(bet, geometry), box, margin)); i += 1) {
    bet = { x: bet.x, y: round1(bet.y + direction * step) };
  }
  return bet;
}

/**
 * Dealer button: beside the plate on the side that faces the table center
 * (right of the plate for left-half seats and the bottom/top center seats),
 * shifted slightly toward the center vertically, and moved off the bet/cards
 * if it would touch them.
 */
function placeButton(
  seat: LayoutPoint,
  isAnchor: boolean,
  avoid: readonly LayoutBox[],
  geometry: TableGeometry,
): LayoutPoint {
  const { center, metrics } = geometry;
  const side = seat.x > center.x + 0.5 ? -1 : 1;
  const towardCenterY = Math.sign(center.y - seat.y);

  if (isAnchor) {
    // Hero: in the corner between the plate top and the right edge of the hole cards.
    const halfCards = getHoleCardsWidthEm(metrics, true) / 2;
    return {
      x: round1(seat.x + emX(geometry, halfCards + CLEARANCE_EM + metrics.button / 2)),
      y: round1(seat.y - emY(geometry, metrics.heroPlate.h / 2 + CLEARANCE_EM + metrics.button / 2)),
    };
  }

  const plate = metrics.plate;
  const x = seat.x + side * emX(geometry, plate.w / 2 + CLEARANCE_EM + metrics.button / 2 + 0.15);
  const maxShift = emY(geometry, plate.h / 2 - metrics.button / 2);
  let y = seat.y + towardCenterY * Math.min(maxShift, Math.abs(center.y - seat.y) * 0.1);
  const margin = emX(geometry, CLEARANCE_EM / 2);
  const step = emY(geometry, 0.25);
  for (let i = 0; i < 24 && avoid.some((box) => boxesOverlap(getButtonBox({ x, y }, geometry), box, margin)); i += 1) {
    // Slide away from the center along y (the bet and cards are on the center side).
    y -= (towardCenterY || -1) * step;
  }
  return { x: round1(clampPct(x)), y: round1(clampPct(y)) };
}

function lerp(from: LayoutPoint, to: LayoutPoint, t: number): LayoutPoint {
  return {
    x: round1(from.x + (to.x - from.x) * t),
    y: round1(from.y + (to.y - from.y) * t),
  };
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
