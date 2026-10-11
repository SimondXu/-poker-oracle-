import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BET_DISTANCE_RATIO,
  MAX_TUNED_LAYOUT_SEATS,
  MIN_LAYOUT_SEATS,
  TABLE_GEOMETRIES,
  boxesOverlap,
  getBetBox,
  getBoardBox,
  getButtonBox,
  getPotBox,
  getSeatFootprint,
  getSeatLayouts,
  getVisualSlot,
  type LayoutBox,
  type LayoutPoint,
  type TableGeometry,
  type TableOrientation,
} from './seat-layout.ts';

const SEAT_COUNTS = Array.from(
  { length: MAX_TUNED_LAYOUT_SEATS - MIN_LAYOUT_SEATS + 1 },
  (_, index) => index + MIN_LAYOUT_SEATS,
);
const ORIENTATIONS: readonly TableOrientation[] = ['landscape', 'portrait'];

function correctedDistance(a: LayoutPoint, b: LayoutPoint, aspect: number): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) / aspect);
}

/** Inside the stage, with a 1% side gutter so plates never touch the screen edge on phones. */
function assertBoxInStage(box: LayoutBox, label: string) {
  assert.ok(box.left >= 1 && box.right <= 99, `${label} x ${box.left.toFixed(1)}..${box.right.toFixed(1)} out of stage`);
  assert.ok(box.top >= 0 && box.bottom <= 100, `${label} y ${box.top.toFixed(1)}..${box.bottom.toFixed(1)} out of stage`);
}

interface OwnedBox {
  owner: string;
  label: string;
  box: LayoutBox;
}

/** Every element box on the table, with cards drawn for every seat (worst case: showdown). */
function collectBoxes(count: number, orientation: TableOrientation): OwnedBox[] {
  const geometry = TABLE_GEOMETRIES[orientation];
  const boxes: OwnedBox[] = [
    { owner: 'board', label: 'board', box: getBoardBox(geometry) },
    { owner: 'pot', label: 'pot', box: getPotBox(geometry) },
  ];
  getSeatLayouts(count, 0, orientation).forEach((layout, seatIndex) => {
    const owner = `seat${seatIndex}`;
    const footprint = getSeatFootprint(layout, geometry);
    boxes.push({ owner, label: `${owner}.plate`, box: footprint.plate });
    boxes.push({ owner, label: `${owner}.cards`, box: footprint.cards! });
    boxes.push({ owner, label: `${owner}.tag`, box: footprint.tag });
    boxes.push({ owner, label: `${owner}.bet`, box: getBetBox(layout.bet, geometry) });
    boxes.push({ owner, label: `${owner}.button`, box: getButtonBox(layout.button, geometry) });
  });
  return boxes;
}

test('getSeatLayouts returns one in-stage layout per seat for 2..10 seats in both orientations', () => {
  for (const orientation of ORIENTATIONS) {
    for (const count of SEAT_COUNTS) {
      for (let hero = 0; hero < count; hero += 1) {
        const layouts = getSeatLayouts(count, hero, orientation);
        assert.equal(layouts.length, count);
      }
      for (const { label, box } of collectBoxes(count, orientation)) {
        assertBoxInStage(box, `${orientation} ${count}-max ${label}`);
      }
    }
  }
});

test('no element of one seat overlaps another seat, the board, or the pot', () => {
  for (const orientation of ORIENTATIONS) {
    for (const count of SEAT_COUNTS) {
      const boxes = collectBoxes(count, orientation);
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          if (a.owner === b.owner) continue;
          // Tags are transient and drawn above bets; only check them against plates, cards and tags.
          const isTagVsChip = (x: OwnedBox, y: OwnedBox) =>
            x.label.endsWith('.tag') && (y.label.endsWith('.bet') || y.label.endsWith('.button') || y.owner === 'pot');
          if (isTagVsChip(a, b) || isTagVsChip(b, a)) continue;
          assert.ok(!boxesOverlap(a.box, b.box), `${orientation} ${count}-max: ${a.label} overlaps ${b.label}`);
        }
      }
    }
  }
});

test("a seat's own bet and dealer button clear its plate and cards", () => {
  for (const orientation of ORIENTATIONS) {
    const geometry = TABLE_GEOMETRIES[orientation];
    for (const count of SEAT_COUNTS) {
      getSeatLayouts(count, 0, orientation).forEach((layout, seatIndex) => {
        const label = `${orientation} ${count}-max seat ${seatIndex}`;
        const footprint = getSeatFootprint(layout, geometry);
        const bet = getBetBox(layout.bet, geometry);
        const button = getButtonBox(layout.button, geometry);
        for (const [name, box] of [['plate', footprint.plate], ['cards', footprint.cards!]] as const) {
          assert.ok(!boxesOverlap(bet, box), `${label} bet overlaps its ${name}`);
          assert.ok(!boxesOverlap(button, box), `${label} button overlaps its ${name}`);
        }
        assert.ok(!boxesOverlap(button, bet), `${label} button overlaps its bet`);
      });
    }
  }
});

test('hero seat sits at bottom center, is the lowest seat, and is the anchor', () => {
  for (const orientation of ORIENTATIONS) {
    for (const count of SEAT_COUNTS) {
      const hero = count - 1;
      const layouts = getSeatLayouts(count, hero, orientation);
      const heroLayout = layouts[hero]!;
      assert.equal(heroLayout.seat.x, 50, `${count}-max hero x`);
      assert.ok(heroLayout.seat.y >= 85, `${count}-max hero y=${heroLayout.seat.y}`);
      assert.equal(heroLayout.isAnchor, true);
      assert.equal(heroLayout.cardsAbove, true);
      for (const [seatIndex, layout] of layouts.entries()) {
        if (seatIndex !== hero) {
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
  for (const orientation of ORIENTATIONS) {
    const { center, seatRing } = TABLE_GEOMETRIES[orientation];
    for (const count of SEAT_COUNTS) {
      for (const [seatIndex, layout] of getSeatLayouts(count, 0, orientation).entries()) {
        const radius = Math.hypot((layout.seat.x - center.x) / seatRing.rx, (layout.seat.y - center.y) / seatRing.ry);
        assert.ok(
          radius > 0.92 && radius < 1.12,
          `${orientation} ${count}-max seat ${seatIndex} radius ${radius.toFixed(2)}`,
        );
      }
    }
  }
});

test('bets sit between seat and center, about 40% of the way in', () => {
  for (const orientation of ORIENTATIONS) {
    const geometry: TableGeometry = TABLE_GEOMETRIES[orientation];
    const { center, aspect } = geometry;
    for (const count of SEAT_COUNTS) {
      for (const [seatIndex, layout] of getSeatLayouts(count, 0, orientation).entries()) {
        const label = `${orientation} ${count}-max seat ${seatIndex}`;
        const total = correctedDistance(layout.seat, center, aspect);
        const toBet = correctedDistance(layout.seat, layout.bet, aspect);
        const betToCenter = correctedDistance(layout.bet, center, aspect);
        assert.ok(betToCenter < total, `${label} bet is not toward the center`);
        assert.ok(toBet / total >= BET_DISTANCE_RATIO - 0.02, `${label} bet ratio ${(toBet / total).toFixed(2)} too close`);
        assert.ok(toBet / total <= 0.8, `${label} bet ratio ${(toBet / total).toFixed(2)} too far`);
        // Beside the plate on the center-facing side: never further from the center than the plate itself (+1em).
        assert.ok(
          correctedDistance(layout.button, center, aspect) < total + geometry.emPct,
          `${label} button is not toward the center`,
        );
      }
    }
  }
});

test('dealer button sits next to its own seat', () => {
  for (const orientation of ORIENTATIONS) {
    const { aspect, emPct } = TABLE_GEOMETRIES[orientation];
    for (const count of SEAT_COUNTS) {
      const layouts = getSeatLayouts(count, 0, orientation);
      layouts.forEach((layout, seatIndex) => {
        const own = correctedDistance(layout.button, layout.seat, aspect);
        // Within ~9em of its own plate center, and closer to it than to any other seat.
        assert.ok(own < 9 * emPct, `${orientation} ${count}-max seat ${seatIndex} button ${own.toFixed(1)} away`);
        layouts.forEach((other, otherIndex) => {
          if (otherIndex === seatIndex) return;
          assert.ok(
            own < correctedDistance(layout.button, other.seat, aspect),
            `${orientation} ${count}-max seat ${seatIndex} button is nearer seat ${otherIndex}`,
          );
        });
      });
    }
  }
});

test('rotation keeps clockwise order: the seat after the hero is bottom-left', () => {
  for (const count of SEAT_COUNTS) {
    for (let hero = 0; hero < count; hero += 1) {
      const layouts = getSeatLayouts(count, hero);
      const anchored = getSeatLayouts(count, 0);
      for (let seatIndex = 0; seatIndex < count; seatIndex += 1) {
        const slot = getVisualSlot(seatIndex, count, hero);
        assert.deepEqual(layouts[seatIndex]!.seat, anchored[slot]!.seat);
      }
      const nextSeat = layouts[(hero + 1) % count]!.seat;
      if (count > 2) {
        assert.ok(nextSeat.x < 50, `${count}-max next seat should be on the left`);
      }
    }
  }
});

test('top-row seats put their cards below the plate', () => {
  const layouts = getSeatLayouts(6, 0);
  assert.equal(layouts[3]!.cardsAbove, false);
  assert.equal(layouts[1]!.cardsAbove, true);
  assert.equal(getSeatLayouts(6, 0, 'portrait')[3]!.cardsAbove, false);
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
