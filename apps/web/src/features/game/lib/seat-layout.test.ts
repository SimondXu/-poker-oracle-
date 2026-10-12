import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_ASPECT_STRETCH,
  MAX_TUNED_LAYOUT_SEATS,
  MIN_LAYOUT_SEATS,
  TABLE_GEOMETRIES,
  TABLE_ORIENTATIONS,
  boxesOverlap,
  fitTableStage,
  getSeatLayouts,
  getTableBoxes,
  getVisualSlot,
  type LayoutBox,
  type LayoutPoint,
  type TableBox,
  type TableOrientation,
} from './seat-layout.ts';

const SEAT_COUNTS = Array.from(
  { length: MAX_TUNED_LAYOUT_SEATS - MIN_LAYOUT_SEATS + 1 },
  (_, index) => index + MIN_LAYOUT_SEATS,
);
/** Em scales the stage can produce (fontPx clamps only downward). */
const EM_SCALES = [1, 0.85, 0.7, 0.55];

function correctedDistance(a: LayoutPoint, b: LayoutPoint, aspect: number): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) / aspect);
}

function describe(box: LayoutBox): string {
  return `[${box.left.toFixed(1)},${box.top.toFixed(1)} → ${box.right.toFixed(1)},${box.bottom.toFixed(1)}]`;
}

/** Pairs that must not intersect: anything of two different owners, and a seat's bet/button vs its own boxes. */
function findCollisions(boxes: readonly TableBox[]): string[] {
  const hits: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const loose = (box: TableBox) => box.kind === 'bet' || box.kind === 'button';
      // A seat's plate, cards and tag are stacked by construction (gaps in em); everything else is checked.
      if (a.owner === b.owner && !loose(a) && !loose(b)) continue;
      if (boxesOverlap(a.box, b.box)) {
        hits.push(`${a.owner}.${a.kind} ${describe(a.box)} x ${b.owner}.${b.kind} ${describe(b.box)}`);
      }
    }
  }
  return hits;
}

function assertInStage(boxes: readonly TableBox[], label: string) {
  for (const { owner, kind, box } of boxes) {
    assert.ok(
      box.left >= 1 && box.right <= 99 && box.top >= 0 && box.bottom <= 100,
      `${label} ${owner}.${kind} ${describe(box)} leaves the stage`,
    );
  }
}

test('no table element intersects another for 2..10 seats, every orientation and em scale', () => {
  for (const orientation of TABLE_ORIENTATIONS) {
    const geometry = TABLE_GEOMETRIES[orientation];
    for (const count of SEAT_COUNTS) {
      for (const emScale of EM_SCALES) {
        const label = `${orientation} ${count}-max @${emScale}`;
        const boxes = getTableBoxes(getSeatLayouts(count, 0, orientation), geometry, emScale);
        assertInStage(boxes, label);
        assert.deepEqual(findCollisions(boxes), [], label);
        // Stretched boxes shrink one axis only.
        for (const [sx, sy] of [[emScale, 1], [1, emScale]] as const) {
          const stretched = getTableBoxes(getSeatLayouts(count, 0, orientation), geometry, sx, sy);
          assert.deepEqual(findCollisions(stretched), [], `${label} stretched ${sx}x${sy}`);
        }
        assertInStage(boxes, label);
        assert.deepEqual(findCollisions(boxes), [], label);
      }
    }
  }
});

test('the pot medallion sits above the board and clears it', () => {
  for (const orientation of TABLE_ORIENTATIONS) {
    const boxes = getTableBoxes(getSeatLayouts(6, 0, orientation), TABLE_GEOMETRIES[orientation]);
    const board = boxes.find((box) => box.kind === 'board')!.box;
    const pot = boxes.find((box) => box.kind === 'pot')!.box;
    assert.ok(pot.bottom < board.top, `${orientation} pot ${describe(pot)} vs board ${describe(board)}`);
  }
});

const STAGE_ASPECTS: ReadonlyArray<readonly [string, number]> = [
  ['9:16', 9 / 16],
  ['3:5', 3 / 5],
  ['3:4', 3 / 4],
  ['1:1', 1],
  ['5:4', 5 / 4],
  ['4:3', 4 / 3],
  ['16:10', 16 / 10],
  ['16:9', 16 / 9],
  ['2:1', 2],
  ['21:9', 21 / 9],
];
const STAGE_HEIGHTS = [420, 640, 900, 1400];

test('fitTableStage keeps a collision-free table inside any stage from 9:16 to 21:9', () => {
  for (const [name, aspect] of STAGE_ASPECTS) {
    for (const stageH of STAGE_HEIGHTS) {
      const stageW = Math.round(stageH * aspect);
      const fit = fitTableStage(stageW, stageH);
      assert.ok(fit, `${name} ${stageW}x${stageH} has a fit`);
      const label = `${name} ${stageW}x${stageH} → ${fit.orientation}`;
      for (const scale of [fit.emScaleX, fit.emScaleY]) {
        assert.ok(scale > 0 && scale <= 1 + 1e-9, `${label} em scale ${scale}`);
      }
      assert.ok(fit.left >= -1e-6 && fit.top >= -1e-6, `${label} box offset`);
      assert.ok(fit.left + fit.width <= stageW + 0.5 && fit.top + fit.height <= stageH + 0.5, `${label} box fits`);
      const geometry = TABLE_GEOMETRIES[fit.orientation];
      const stretch = fit.width / fit.height / geometry.aspect;
      assert.ok(
        stretch >= 1 / MAX_ASPECT_STRETCH - 1e-6 && stretch <= MAX_ASPECT_STRETCH + 1e-6,
        `${label} stretch ${stretch.toFixed(2)}`,
      );
      // Fills the stage on at least one axis, and fully when the stretch allows it.
      assert.ok(fit.width >= stageW - 0.5 || fit.height >= stageH - 0.5, `${label} fills one axis`);
      for (const count of SEAT_COUNTS) {
        const boxes = getTableBoxes(getSeatLayouts(count, 0, fit.orientation), geometry, fit.emScaleX, fit.emScaleY);
        assertInStage(boxes, `${label} ${count}-max`);
        assert.deepEqual(findCollisions(boxes), [], `${label} ${count}-max`);
      }
    }
  }
});

test('fitTableStage picks portrait on phones, landscape on wide stages, square near 1:1', () => {
  assert.equal(fitTableStage(390, 640)?.orientation, 'portrait');
  assert.equal(fitTableStage(1500, 850)?.orientation, 'landscape');
  assert.equal(fitTableStage(648, 600)?.orientation, 'square');
  // Phones stay portrait even when the stage gets short (raise row open).
  assert.equal(fitTableStage(360, 420)?.orientation, 'portrait');
  // A 1044×760 desktop stage is filled edge to edge.
  const desktop = fitTableStage(1044, 760)!;
  assert.ok(desktop.width === 1044 && desktop.height === 760, `${desktop.width}x${desktop.height}`);
  assert.equal(fitTableStage(0, 600), null);
  // The em never grows past the geometry cap.
  const huge = fitTableStage(5000, 3000)!;
  assert.ok(huge.fontPx <= TABLE_GEOMETRIES[huge.orientation].maxFontPx);
});

test('every seat index gets a layout for any hero, and the hero sits at bottom center', () => {
  for (const orientation of TABLE_ORIENTATIONS) {
    for (const count of SEAT_COUNTS) {
      for (let hero = 0; hero < count; hero += 1) {
        const layouts = getSeatLayouts(count, hero, orientation);
        assert.equal(layouts.length, count);
        const heroLayout = layouts[hero]!;
        assert.equal(heroLayout.seat.x, 50, `${orientation} ${count}-max hero x`);
        assert.ok(heroLayout.seat.y >= 85, `${orientation} ${count}-max hero y=${heroLayout.seat.y}`);
        assert.equal(heroLayout.isAnchor, true);
        assert.equal(heroLayout.cardsAbove, true);
        for (const [seatIndex, layout] of layouts.entries()) {
          if (seatIndex === hero) continue;
          assert.ok(layout.seat.y < heroLayout.seat.y, `${count}-max seat ${seatIndex} not above hero`);
          assert.equal(layout.isAnchor, false);
        }
      }
    }
  }
});

test('spectating (null hero) anchors seat 0 at bottom center', () => {
  for (const count of SEAT_COUNTS) {
    assert.deepEqual(getSeatLayouts(count, null)[0]!.seat, getSeatLayouts(count, 0)[0]!.seat);
    assert.equal(getSeatLayouts(count, null)[0]!.seat.x, 50);
  }
});

test('seats sit on the rail ring, not floating outside it', () => {
  for (const orientation of TABLE_ORIENTATIONS) {
    const { center, seatRing } = TABLE_GEOMETRIES[orientation];
    for (const count of SEAT_COUNTS) {
      for (const [seatIndex, layout] of getSeatLayouts(count, 0, orientation).entries()) {
        const radius = Math.hypot((layout.seat.x - center.x) / seatRing.rx, (layout.seat.y - center.y) / seatRing.ry);
        assert.ok(
          radius > 0.9 && radius < 1.14,
          `${orientation} ${count}-max seat ${seatIndex} radius ${radius.toFixed(2)}`,
        );
      }
    }
  }
});

test('bets sit toward the center and the dealer button next to its own seat', () => {
  for (const orientation of TABLE_ORIENTATIONS) {
    const { center, aspect, emPct } = TABLE_GEOMETRIES[orientation];
    for (const count of SEAT_COUNTS) {
      const layouts = getSeatLayouts(count, 0, orientation);
      layouts.forEach((layout, seatIndex) => {
        const label = `${orientation} ${count}-max seat ${seatIndex}`;
        assert.ok(
          correctedDistance(layout.bet, center, aspect) < correctedDistance(layout.seat, center, aspect),
          `${label} bet is not toward the center`,
        );
        const own = correctedDistance(layout.button, layout.seat, aspect);
        assert.ok(own < 9 * emPct, `${label} button ${own.toFixed(1)} away`);
        layouts.forEach((other, otherIndex) => {
          if (otherIndex === seatIndex) return;
          assert.ok(
            own < correctedDistance(layout.button, other.seat, aspect),
            `${label} button is nearer seat ${otherIndex}`,
          );
        });
      });
    }
  }
});

test('rotation keeps clockwise order: the seat after the hero is bottom-left', () => {
  const orientations: readonly TableOrientation[] = TABLE_ORIENTATIONS;
  for (const orientation of orientations) {
    for (const count of SEAT_COUNTS) {
      for (let hero = 0; hero < count; hero += 1) {
        const layouts = getSeatLayouts(count, hero, orientation);
        const anchored = getSeatLayouts(count, 0, orientation);
        for (let seatIndex = 0; seatIndex < count; seatIndex += 1) {
          const slot = getVisualSlot(seatIndex, count, hero);
          assert.deepEqual(layouts[seatIndex]!.seat, anchored[slot]!.seat);
        }
        if (count > 2) {
          assert.ok(layouts[(hero + 1) % count]!.seat.x < 50, `${orientation} ${count}-max next seat should be on the left`);
        }
      }
    }
  }
});

test('top-row seats put their cards below the plate', () => {
  for (const orientation of TABLE_ORIENTATIONS) {
    const layouts = getSeatLayouts(6, 0, orientation);
    assert.equal(layouts[3]!.cardsAbove, false, orientation);
    assert.equal(layouts[1]!.cardsAbove, true, orientation);
  }
});

test('getSeatLayouts is referentially stable and handles out-of-range input', () => {
  assert.equal(getSeatLayouts(6, 2), getSeatLayouts(6, 2));
  assert.equal(getSeatLayouts(6, 2, 'portrait'), getSeatLayouts(6, 2, 'portrait'));
  assert.notEqual(getSeatLayouts(6, 2), getSeatLayouts(6, 2, 'portrait'));
  assert.equal(getSeatLayouts(1, null).length, 2);
  assert.equal(getSeatLayouts(6, 9), getSeatLayouts(6, 0));

  const large = getSeatLayouts(12, 3);
  assert.equal(large.length, 12);
  large.forEach((layout, index) => assert.ok(layout.seat.x >= 0 && layout.seat.x <= 100, `12-max seat ${index}`));
  assert.equal(large[3]!.seat.x, 50);
});
