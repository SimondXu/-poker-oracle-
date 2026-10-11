/**
 * Seat layout for the table stage (pure, no React).
 *
 * The stage draws the table in a fixed-aspect box (one per orientation:
 * landscape 16:9, square 6:5, portrait 3:5) letterboxed into whatever space
 * the page gives it. Every coordinate is a percentage of that box (`x` of its
 * width, `y` of its height) and every element size is in em of the box
 * font-size, which is `emPct`% of the box width (clamped only downward). So the
 * whole table scales by one factor and the layout is collision-free by
 * construction: if the nominal layout has no intersections, no stage size can
 * create one. `seat-layout.test.ts` asserts that for 2..10 seats, every
 * orientation, stage aspects from 9:16 to 21:9, and every em scale ≤ 1.
 *
 * Seats come from hand-tuned tables per player count. Visual slot 0 is bottom
 * center (the hero, or seat 0 when spectating); slots continue clockwise on
 * screen (the next seat sits to the hero's left). Bets and dealer buttons are
 * placed from the seat footprints so they clear every plate, card pair, tag,
 * the board and the pot.
 */
import {
  CARD_EM,
  CARD_HIGHLIGHT_RAISE_EM,
  POT_MEDALLION_EM,
} from '../../../components/poker/types.ts';

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
  /** Center of the bet chip box, between seat and table center. */
  bet: LayoutPoint;
  /** Center of the dealer button at nominal scale (see `getButtonPoint`; the disc is drawn in em from the plate). */
  button: LayoutPoint;
  /** Side of the plate the dealer disc sits on, vertically centered on the plate. */
  buttonSide: 'left' | 'right';
  /** Hole cards sit above the plate (false for the top row: cards go below, toward the felt). */
  cardsAbove: boolean;
  /** Bottom-center slot (hero, or seat 0 when spectating): bigger plate and cards. */
  isAnchor: boolean;
}

export type TableOrientation = 'landscape' | 'square' | 'portrait';

/** Element sizes in em of the stage font-size. Card boxes are CARD_EM of their own font-size. */
export interface SeatMetrics {
  plate: { w: number; h: number };
  heroPlate: { w: number; h: number };
  /** Plate text sizes (name line, stack line). */
  nameText: number;
  stackText: number;
  /** Card font-size for opponents' hole cards (index-only print). */
  seatCard: number;
  /** Card font-size for the hero's hole cards. */
  heroCard: number;
  /** Card font-size for the board. */
  boardCard: number;
  boardGap: number;
  seatCardGap: number;
  heroCardGap: number;
  /** Visible gap between the plate's outer edge (state ring included) and its hole cards. */
  cardGap: number;
  /** Opponents' face-down backs are drawn (false on the compact phone layout: plate only). */
  showFaceDownBacks: boolean;
  /** Bet box (chip + amount up to "10,000"). Its content font is `betText`. */
  bet: { w: number; h: number };
  betText: number;
  /** Dealer button diameter. */
  button: number;
  /** Last-action stamp / hand-name label box (opposite side of the cards), room for a -3° stamp. */
  tag: { w: number; h: number };
  /** Visible gap between the plate's outer edge (state ring included) and the tag ink. */
  tagGap: number;
  /** Pot medallion font-size (box = POT_MEDALLION_EM of it). */
  potText: number;
  /** Gap between the pot medallion and the board. */
  potGap: number;
  /** The acting seat lifts by this much. */
  actorLift: number;
}

export interface TableGeometry {
  orientation: TableOrientation;
  /** Stage box width / height. */
  aspect: number;
  center: LayoutPoint;
  /** Felt oval, stage percent. The rail is drawn just outside it. */
  felt: { cx: number; cy: number; rx: number; ry: number };
  /** Rail thickness in percent of stage width (y is aspect-corrected when drawn). */
  railPct: number;
  /** Ellipse the seat plates sit on (≈ middle of the rail). */
  seatRing: { rx: number; ry: number };
  /** 1em in percent of stage width at nominal scale. */
  emPct: number;
  /** Largest stage font-size; above it the table content stops growing (scale < 1 is always safe). */
  maxFontPx: number;
  /** Seats above this y put their cards below the plate. */
  topRowMaxY: number;
  /** Compact phone layout: plate-only opponents. */
  compact: boolean;
  metrics: SeatMetrics;
}

const LANDSCAPE_METRICS: SeatMetrics = {
  plate: { w: 8.6, h: 3 },
  heroPlate: { w: 11.6, h: 3.3 },
  nameText: 0.82,
  stackText: 1,
  seatCard: 0.85,
  heroCard: 2.2,
  boardCard: 1.5,
  boardGap: 0.35,
  seatCardGap: 0.12,
  heroCardGap: 0.22,
  cardGap: 0.3,
  showFaceDownBacks: true,
  bet: { w: 4.6, h: 1.3 },
  betText: 0.8,
  button: 1.25,
  tag: { w: 7.2, h: 1.6 },
  tagGap: 0.3,
  potText: 0.8,
  potGap: 0.4,
  actorLift: 0.25,
};

const SQUARE_METRICS: SeatMetrics = {
  ...LANDSCAPE_METRICS,
  heroPlate: { w: 10.5, h: 3.3 },
  heroCard: 2.05,
  boardCard: 1.35,
  boardGap: 0.3,
  potText: 0.82,
};

const PORTRAIT_METRICS: SeatMetrics = {
  plate: { w: 6.6, h: 3 },
  heroPlate: { w: 9.4, h: 3.3 },
  nameText: 0.92,
  stackText: 1.05,
  seatCard: 0.8,
  heroCard: 1.8,
  boardCard: 1.2,
  boardGap: 0.25,
  seatCardGap: 0.1,
  heroCardGap: 0.2,
  cardGap: 0.3,
  showFaceDownBacks: false,
  bet: { w: 4.4, h: 1.3 },
  betText: 0.8,
  button: 1.25,
  tag: { w: 6.6, h: 1.6 },
  tagGap: 0.3,
  potText: 0.9,
  potGap: 0.4,
  actorLift: 0.2,
};

export const TABLE_GEOMETRIES: Readonly<Record<TableOrientation, TableGeometry>> = {
  landscape: {
    orientation: 'landscape',
    aspect: 16 / 9,
    center: { x: 50, y: 48 },
    felt: { cx: 50, cy: 48, rx: 40, ry: 35 },
    railPct: 2.2,
    seatRing: { rx: 41.1, ry: 37 },
    emPct: 1.45,
    maxFontPx: 20,
    topRowMaxY: 25,
    compact: false,
    metrics: LANDSCAPE_METRICS,
  },
  square: {
    orientation: 'square',
    aspect: 1.2,
    center: { x: 50, y: 48 },
    felt: { cx: 50, cy: 48, rx: 38, ry: 35 },
    railPct: 2.6,
    seatRing: { rx: 39, ry: 37 },
    emPct: 1.9,
    maxFontPx: 20,
    topRowMaxY: 25,
    compact: false,
    metrics: SQUARE_METRICS,
  },
  portrait: {
    orientation: 'portrait',
    aspect: 0.6,
    center: { x: 50, y: 46 },
    felt: { cx: 50, cy: 46, rx: 38, ry: 37 },
    railPct: 3,
    seatRing: { rx: 40, ry: 39 },
    emPct: 2.9,
    maxFontPx: 16,
    topRowMaxY: 25,
    compact: true,
    metrics: PORTRAIT_METRICS,
  },
};

export const TABLE_ORIENTATIONS: readonly TableOrientation[] = ['landscape', 'square', 'portrait'];

/** Landscape geometry (kept for callers that predate orientations). */
export const TABLE_GEOMETRY = TABLE_GEOMETRIES.landscape;

export const MIN_LAYOUT_SEATS = 2;
export const MAX_TUNED_LAYOUT_SEATS = 10;

/** Bets sit this far (em) clear of their own seat's footprint along the seat→center ray (pushed further only to clear things). */
export const BET_SEAT_GAP_EM = 1;
const MAX_BET_DISTANCE_RATIO = 0.85;
/**
 * The to-act / winner ring drawn outside the plate (TableSeat: outline 0.16em
 * + offset 0.08em). Cards and tags step out by it while the ring shows, so
 * their visible gap to the plate's outer edge stays `cardGap` / `tagGap`.
 */
export const PLATE_RING_EM = 0.24;
/** Edge gap between the plate and the dealer disc beside it. */
export const BUTTON_GAP_EM = 0.35;
/** Clear space kept around boxes when placing bets/buttons, in em. */
const CLEARANCE_EM = 0.25;
/** Bets keep more air around them (a chip touching a card back reads as clutter). */
const BET_CLEARANCE_EM = 0.5;

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

const SQUARE_TABLES: Readonly<Record<number, readonly Pt[]>> = {
  2: [[50, 88], [50, 11]],
  3: [[50, 88], [14, 32], [86, 32]],
  4: [[50, 88], [12, 48], [50, 11], [88, 48]],
  5: [[50, 88], [13, 64], [28, 15], [72, 15], [87, 64]],
  6: [[50, 88], [14, 70], [14, 29], [50, 11], [86, 29], [86, 70]],
  7: [[50, 88], [19, 77], [12, 45], [29, 14], [71, 14], [88, 45], [81, 77]],
  8: [[50, 88], [23, 78], [12, 56], [17, 23], [50, 11], [83, 23], [88, 56], [77, 78]],
  9: [[50, 88], [24, 78], [12, 59], [13, 29], [34, 12], [66, 12], [87, 29], [88, 59], [76, 78]],
  10: [
    [50, 88], [26, 79], [12, 63], [12, 38], [24, 16],
    [50, 11], [76, 16], [88, 38], [88, 63], [74, 79],
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
  square: SQUARE_TABLES,
  portrait: PORTRAIT_TABLES,
};

// ─────────────────────────────────────────────
// Stage fit
// ─────────────────────────────────────────────

export interface TableStageFit {
  orientation: TableOrientation;
  /** Box inside the stage, px. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Box font-size (1em), px. */
  fontPx: number;
  /** fontPx / nominal per axis (box width × emPct, box height × aspect × emPct); both ≤ 1. */
  emScaleX: number;
  emScaleY: number;
}

/**
 * How far the box may stretch from its geometry's aspect to fill the stage.
 * Stretching is safe: the em follows the tighter axis, so the other axis only
 * gains room (see emScaleX / emScaleY).
 */
export const MAX_ASPECT_STRETCH = 1.35;
/** A later (squarer) orientation replaces an earlier one only when its em is this much larger. */
const ORIENTATION_SWITCH_GAIN = 1.12;
/** Stages narrower than this (phones) always use the portrait table. */
export const PORTRAIT_ONLY_MAX_WIDTH_PX = 560;

function fitOrientation(orientation: TableOrientation, stageW: number, stageH: number): TableStageFit {
  const geometry = TABLE_GEOMETRIES[orientation];
  const stageAspect = stageW / stageH;
  const aspect = Math.min(geometry.aspect * MAX_ASPECT_STRETCH, Math.max(geometry.aspect / MAX_ASPECT_STRETCH, stageAspect));
  const width = Math.min(stageW, stageH * aspect);
  const height = width / aspect;
  const nominalX = (width * geometry.emPct) / 100;
  const nominalY = (height * geometry.aspect * geometry.emPct) / 100;
  const fontPx = Math.min(nominalX, nominalY, geometry.maxFontPx);
  return {
    orientation,
    width,
    height,
    left: (stageW - width) / 2,
    top: (stageH - height) / 2,
    fontPx,
    emScaleX: fontPx / nominalX,
    emScaleY: fontPx / nominalY,
  };
}

/**
 * Fits the table into a `stageW × stageH` area: the box takes the stage's
 * aspect (within MAX_ASPECT_STRETCH of the geometry's), so the felt fills the
 * stage. Picks the orientation with the largest em (landscape, then square,
 * then portrait, each needing a clear gain); phones are portrait-only.
 * Returns null for an empty area.
 */
export function fitTableStage(stageW: number, stageH: number): TableStageFit | null {
  if (!(stageW > 0 && stageH > 0)) return null;
  if (stageW < PORTRAIT_ONLY_MAX_WIDTH_PX) return fitOrientation('portrait', stageW, stageH);
  let best: TableStageFit | null = null;
  for (const orientation of TABLE_ORIENTATIONS) {
    const fit = fitOrientation(orientation, stageW, stageH);
    if (!best || fit.fontPx > best.fontPx * ORIENTATION_SWITCH_GAIN) best = fit;
  }
  return best;
}

// ─────────────────────────────────────────────
// Seat layouts
// ─────────────────────────────────────────────

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

  const slotLayouts = getSlotLayouts(seatCount, TABLE_GEOMETRIES[orientation]);
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
  const layouts = buildSlotLayouts(points, geometry);
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

function liftBox(box: LayoutBox, liftPct: number): LayoutBox {
  return { ...box, top: box.top - liftPct };
}

/** Geometry with em sizes multiplied by `scaleX` horizontally and `scaleY` vertically (positions unchanged). */
export function scaleGeometry(geometry: TableGeometry, scaleX: number, scaleY = scaleX): TableGeometry {
  if (scaleX === 1 && scaleY === 1) return geometry;
  return { ...geometry, emPct: geometry.emPct * scaleX, aspect: (geometry.aspect * scaleY) / scaleX };
}

export interface SeatFootprint {
  plate: LayoutBox;
  /** Hole cards box (null when this seat draws no cards), highlight raise included. */
  cards: LayoutBox | null;
  /** Last-action stamp / hand-name slot (opposite side of the cards). */
  tag: LayoutBox;
}

/** Width of a seat's two hole cards, in em. */
export function getHoleCardsWidthEm(metrics: SeatMetrics, isAnchor: boolean): number {
  return isAnchor
    ? 2 * CARD_EM.w * metrics.heroCard + metrics.heroCardGap
    : 2 * CARD_EM.w * metrics.seatCard + metrics.seatCardGap;
}

/** Height of a seat's hole-card box (card + highlight raise), in em. */
export function getHoleCardsHeightEm(metrics: SeatMetrics, isAnchor: boolean): number {
  const cardFont = isAnchor ? metrics.heroCard : metrics.seatCard;
  return (CARD_EM.h + CARD_HIGHLIGHT_RAISE_EM) * cardFont;
}

/**
 * Boxes a seat can occupy. Worst case: cards drawn, and (with `withLift`) the
 * union of the resting and lifted (acting) positions.
 */
/** Tag slot width: the hero's slot spans its (wider) plate. */
export function getTagWidthEm(metrics: SeatMetrics, isAnchor: boolean): number {
  return isAnchor ? Math.max(metrics.tag.w, metrics.heroPlate.w) : metrics.tag.w;
}

export function getSeatFootprint(
  layout: Pick<SeatLayout, 'seat' | 'cardsAbove' | 'isAnchor'>,
  geometry: TableGeometry,
  { hasCards = true, withLift = true }: { hasCards?: boolean; withLift?: boolean } = {},
): SeatFootprint {
  const { metrics } = geometry;
  const lift = withLift ? emY(geometry, metrics.actorLift) : 0;
  const plateSize = layout.isAnchor ? metrics.heroPlate : metrics.plate;
  const plate = boxAround(layout.seat, geometry, plateSize.w, plateSize.h);

  let cards: LayoutBox | null = null;
  if (hasCards) {
    const height = emY(geometry, getHoleCardsHeightEm(metrics, layout.isAnchor));
    const halfW = emX(geometry, getHoleCardsWidthEm(metrics, layout.isAnchor)) / 2;
    const gap = emY(geometry, metrics.cardGap + PLATE_RING_EM);
    const top = layout.cardsAbove ? plate.top - gap - height : plate.bottom + gap;
    cards = liftBox({ left: layout.seat.x - halfW, right: layout.seat.x + halfW, top, bottom: top + height }, lift);
  }

  const tagHalfW = emX(geometry, getTagWidthEm(metrics, layout.isAnchor)) / 2;
  const tagGap = emY(geometry, metrics.tagGap + PLATE_RING_EM);
  const tagH = emY(geometry, metrics.tag.h);
  const tagTop = layout.cardsAbove ? plate.bottom + tagGap : plate.top - tagGap - tagH;
  const tag = liftBox(
    { left: layout.seat.x - tagHalfW, right: layout.seat.x + tagHalfW, top: tagTop, bottom: tagTop + tagH },
    lift,
  );

  return { plate: liftBox(plate, lift), cards, tag };
}

export function getBetBox(point: LayoutPoint, geometry: TableGeometry): LayoutBox {
  return boxAround(point, geometry, geometry.metrics.bet.w, geometry.metrics.bet.h);
}

export function getButtonBox(point: LayoutPoint, geometry: TableGeometry): LayoutBox {
  return boxAround(point, geometry, geometry.metrics.button, geometry.metrics.button);
}

/**
 * Dealer disc center: BUTTON_GAP_EM beside the plate on `side`, vertically
 * centered on it. TableSeat draws it in em inside the seat, so this holds at
 * any stage scale.
 */
export function getButtonPoint(
  layout: Pick<SeatLayout, 'seat' | 'isAnchor'>,
  side: SeatLayout['buttonSide'],
  geometry: TableGeometry,
): LayoutPoint {
  const { metrics } = geometry;
  const plate = layout.isAnchor ? metrics.heroPlate : metrics.plate;
  const dx = emX(geometry, plate.w / 2 + BUTTON_GAP_EM + metrics.button / 2);
  return { x: layout.seat.x + (side === 'right' ? dx : -dx), y: layout.seat.y };
}

/** The disc's box, resting and lifted with its (acting) seat. */
function getSeatButtonBox(
  layout: Pick<SeatLayout, 'seat' | 'isAnchor'>,
  side: SeatLayout['buttonSide'],
  geometry: TableGeometry,
): LayoutBox {
  return liftBox(getButtonBox(getButtonPoint(layout, side, geometry), geometry), emY(geometry, geometry.metrics.actorLift));
}

/** Board width/height in em (5 card slots + the highlight raise). */
export function getBoardSizeEm(metrics: SeatMetrics): { w: number; h: number } {
  return {
    w: 5 * CARD_EM.w * metrics.boardCard + 4 * metrics.boardGap,
    h: (CARD_EM.h + CARD_HIGHLIGHT_RAISE_EM) * metrics.boardCard,
  };
}

/** Board box: card row centered on `center`, highlight raise above it. */
export function getBoardBox(geometry: TableGeometry): LayoutBox {
  const { metrics, center } = geometry;
  const size = getBoardSizeEm(metrics);
  const rowHalf = emY(geometry, CARD_EM.h * metrics.boardCard) / 2;
  const halfW = emX(geometry, size.w) / 2;
  return {
    left: center.x - halfW,
    right: center.x + halfW,
    top: center.y - rowHalf - emY(geometry, CARD_HIGHLIGHT_RAISE_EM * metrics.boardCard),
    bottom: center.y + rowHalf,
  };
}

export function getPotSizeEm(metrics: SeatMetrics): { w: number; h: number } {
  return { w: POT_MEDALLION_EM.w * metrics.potText, h: POT_MEDALLION_EM.h * metrics.potText };
}

/** Pot medallion box: centered above the board, `potGap` clear of it. */
export function getPotBox(geometry: TableGeometry): LayoutBox {
  const board = getBoardBox(geometry);
  const size = getPotSizeEm(geometry.metrics);
  const halfW = emX(geometry, size.w) / 2;
  const bottom = board.top - emY(geometry, geometry.metrics.potGap);
  return { left: geometry.center.x - halfW, right: geometry.center.x + halfW, top: bottom - emY(geometry, size.h), bottom };
}

/** Center of the pot medallion. */
export function getPotPoint(geometry: TableGeometry): LayoutPoint {
  const box = getPotBox(geometry);
  return { x: geometry.center.x, y: (box.top + box.bottom) / 2 };
}

export function boxesOverlap(a: LayoutBox, b: LayoutBox, margin = 0): boolean {
  return a.left < b.right + margin && b.left < a.right + margin && a.top < b.bottom + margin && b.top < a.bottom + margin;
}

function insideStage(box: LayoutBox): boolean {
  return box.left >= 1 && box.right <= 99 && box.top >= 0.5 && box.bottom <= 99.5;
}

// ─────────────────────────────────────────────
// Every box on the table (placement + tests)
// ─────────────────────────────────────────────

export type TableBoxKind = 'plate' | 'cards' | 'tag' | 'bet' | 'button' | 'board' | 'pot';

export interface TableBox {
  /** 'table' for board/pot, else `seat<index>` (slot index for slot layouts). */
  owner: string;
  kind: TableBoxKind;
  box: LayoutBox;
}

/**
 * Worst-case boxes for a table: every seat with cards, a tag, a bet and the
 * dealer button, plus board and pot. `emScaleX` / `emScaleY` shrink the em
 * sizes per axis (positions are computed at nominal scale, as on screen).
 */
export function getTableBoxes(
  layouts: readonly SeatLayout[],
  geometry: TableGeometry,
  emScaleX = 1,
  emScaleY = emScaleX,
): TableBox[] {
  const g = scaleGeometry(geometry, emScaleX, emScaleY);
  const boxes: TableBox[] = [
    { owner: 'table', kind: 'board', box: getBoardBox(g) },
    { owner: 'table', kind: 'pot', box: getPotBox(g) },
  ];
  layouts.forEach((layout, index) => {
    const owner = `seat${index}`;
    const footprint = getSeatFootprint(layout, g);
    boxes.push({ owner, kind: 'plate', box: footprint.plate });
    if (footprint.cards) boxes.push({ owner, kind: 'cards', box: footprint.cards });
    boxes.push({ owner, kind: 'tag', box: footprint.tag });
    boxes.push({ owner, kind: 'bet', box: getBetBox(layout.bet, g) });
    boxes.push({ owner, kind: 'button', box: getSeatButtonBox(layout, layout.buttonSide, g) });
  });
  return boxes;
}

// ─────────────────────────────────────────────
// Bet / button placement
// ─────────────────────────────────────────────

function buildSlotLayouts(points: readonly Pt[], geometry: TableGeometry): readonly SeatLayout[] {
  const seats = points.map(([x, y], slot) => {
    const isAnchor = slot === 0;
    return { seat: { x, y }, isAnchor, cardsAbove: isAnchor || y > geometry.topRowMaxY };
  });
  const fixed: LayoutBox[] = [getBoardBox(geometry), getPotBox(geometry)];
  const footprints = seats.map((seat) => getSeatFootprint(seat, geometry));
  for (const footprint of footprints) {
    fixed.push(footprint.plate, footprint.cards!, footprint.tag);
  }

  // Dealer disc slots first: every seat reserves one (the button moves), so a bet never depends on who has it.
  const buttonBoxes: LayoutBox[] = [];
  const buttonSides = seats.map((seat) => {
    const side = placeButton(seat, [...fixed, ...buttonBoxes], geometry);
    buttonBoxes.push(getSeatButtonBox(seat, side, geometry));
    return side;
  });

  const placedBets: LayoutBox[] = [];
  const bets = seats.map((seat, slot) => {
    const footprint = footprints[slot]!;
    const own = [footprint.plate, footprint.cards!, footprint.tag, buttonBoxes[slot]!];
    const bet = placeBet(seat.seat, own, [...fixed, ...buttonBoxes, ...placedBets], geometry);
    placedBets.push(getBetBox(bet, geometry));
    return bet;
  });

  return Object.freeze(
    seats.map((seat, slot) => {
      const buttonSide = buttonSides[slot]!;
      return Object.freeze({
        seat: Object.freeze(seat.seat),
        bet: Object.freeze(bets[slot]!),
        button: Object.freeze(getButtonPoint(seat, buttonSide, geometry)),
        buttonSide,
        cardsAbove: seat.cardsAbove,
        isAnchor: seat.isAnchor,
      });
    }),
  );
}

/** Edge-to-edge distance between two boxes, in em (aspect-corrected). */
function emGap(a: LayoutBox, b: LayoutBox, geometry: TableGeometry): number {
  const dx = Math.max(0, a.left - b.right, b.left - a.right) / geometry.emPct;
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom) / (geometry.emPct * geometry.aspect);
  return Math.hypot(dx, dy);
}

/**
 * Bet: on the seat→center ray, at the first point BET_SEAT_GAP_EM clear of
 * the seat's own plate, cards, tag and dealer-disc slot (so every seat's bet sits the same em
 * distance off its footprint), pushed further in only as far as needed to
 * clear every seat, tag, the board, the pot and earlier bets; if the straight
 * line is blocked, small sideways nudges are tried at each step.
 */
function placeBet(
  seat: LayoutPoint,
  own: readonly LayoutBox[],
  avoid: readonly LayoutBox[],
  geometry: TableGeometry,
): LayoutPoint {
  const { center } = geometry;
  const margin = emX(geometry, BET_CLEARANCE_EM);
  const isClear = (point: LayoutPoint) => {
    const box = getBetBox(point, geometry);
    return insideStage(box) && !avoid.some((other) => boxesOverlap(box, other, margin));
  };
  let start = MAX_BET_DISTANCE_RATIO;
  for (let ratio = 0; ratio <= MAX_BET_DISTANCE_RATIO; ratio += 0.005) {
    const box = getBetBox(lerp(seat, center, ratio), geometry);
    if (own.every((other) => emGap(box, other, geometry) >= BET_SEAT_GAP_EM - 1e-6)) {
      start = ratio;
      break;
    }
  }
  // Small nudges first (any ratio), then larger ones: a side seat facing a wide board
  // (portrait) parks its bet above or below the board instead of on it.
  const away = seat.y <= center.y ? -1 : 1;
  for (const maxNudge of [3, 16]) {
    for (let ratio = start; ratio <= MAX_BET_DISTANCE_RATIO + 1e-9; ratio += 0.01) {
      const base = lerp(seat, center, ratio);
      for (let step = 0; step <= maxNudge; step += 1) {
        for (const sign of step === 0 ? [1] : [away, -away]) {
          const point = { x: round1(base.x), y: round1(base.y + sign * step * emY(geometry, 0.3)) };
          if (isClear(point)) return point;
        }
      }
    }
  }
  return lerp(seat, center, start);
}

/**
 * Dealer button side: beside the plate on the side facing the table center
 * (right of the plate for left-half seats and the center seats), else the
 * other side; the first that clears everything wins.
 */
function placeButton(
  seat: Pick<SeatLayout, 'seat' | 'isAnchor' | 'cardsAbove'>,
  avoid: readonly LayoutBox[],
  geometry: TableGeometry,
): SeatLayout['buttonSide'] {
  const preferred: SeatLayout['buttonSide'] = seat.seat.x > geometry.center.x + 0.5 ? 'left' : 'right';
  const other: SeatLayout['buttonSide'] = preferred === 'left' ? 'right' : 'left';
  const margin = emX(geometry, CLEARANCE_EM / 2);
  for (const side of [preferred, other]) {
    const box = getSeatButtonBox(seat, side, geometry);
    if (insideStage(box) && !avoid.some((other) => boxesOverlap(box, other, margin))) return side;
  }
  return preferred;
}

function lerp(from: LayoutPoint, to: LayoutPoint, t: number): LayoutPoint {
  return {
    x: round1(from.x + (to.x - from.x) * t),
    y: round1(from.y + (to.y - from.y) * t),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
