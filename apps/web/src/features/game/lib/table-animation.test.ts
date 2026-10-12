import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCommunityRevealSteps,
  getCommunityRunoutMs,
  getDealDurationMs,
  getDisplayedSeatStack,
  getHandResultPhaseTimeline,
  getHoleCardSecondPassDelay,
  getSeatDealOrderIndex,
  shouldAnimatePotAward,
  shouldDimLosingSeat,
  shouldRevealShowdownCards,
  shouldShowWinnerIdentity,
  shouldShowWinnerAnnouncement,
} from './table-animation.ts';

test('buildCommunityRevealSteps staggers a flop card by card, starting at once after the street hold', () => {
  assert.deepEqual(buildCommunityRevealSteps(0, 3), [
    { count: 1, delayMs: 0 },
    { count: 2, delayMs: 160 },
    { count: 3, delayMs: 320 },
  ]);
});

test('buildCommunityRevealSteps keeps turn and river as separate beats', () => {
  assert.deepEqual(buildCommunityRevealSteps(3, 4), [{ count: 4, delayMs: 0 }]);
  assert.deepEqual(buildCommunityRevealSteps(3, 5), [
    { count: 4, delayMs: 0 },
    { count: 5, delayMs: 780 },
  ]);
});

test('getCommunityRunoutMs waits for the last new card to land', () => {
  assert.equal(getCommunityRunoutMs(5, 5), 0);
  assert.equal(getCommunityRunoutMs(4, 5), 200);
  assert.equal(getCommunityRunoutMs(0, 5), 1880 + 200);
});

test('getDealDurationMs covers both passes of the hole-card deal', () => {
  assert.equal(getDealDurationMs(2), Math.round((0.14 + 0.62) * 1000) + 200);
  assert.equal(getDealDurationMs(6), Math.round((5 * 0.14 + 0.94) * 1000) + 200);
});

test('buildCommunityRevealSteps returns no work when the board does not grow', () => {
  assert.deepEqual(buildCommunityRevealSteps(5, 5), []);
});

test('shouldRevealShowdownCards starts only after the announcing phase', () => {
  assert.equal(shouldRevealShowdownCards('announcing'), false);
  assert.equal(shouldRevealShowdownCards('revealing'), true);
  assert.equal(shouldRevealShowdownCards('showing'), true);
  assert.equal(shouldRevealShowdownCards('done'), true);
});

test('shouldShowWinnerIdentity waits until the reveal beat has finished', () => {
  assert.equal(shouldShowWinnerIdentity('announcing'), false);
  assert.equal(shouldShowWinnerIdentity('revealing'), false);
  assert.equal(shouldShowWinnerIdentity('showing'), true);
  assert.equal(shouldShowWinnerIdentity('done'), true);
});

test('shouldDimLosingSeat only dims revealed losers at hand end', () => {
  assert.equal(
    shouldDimLosingSeat({
      phase: 'hand_end',
      resultPhase: 'showing',
      isWinner: false,
      status: 'active',
    }),
    true,
  );
  assert.equal(
    shouldDimLosingSeat({
      phase: 'hand_end',
      resultPhase: 'revealing',
      isWinner: false,
      status: 'active',
    }),
    false,
  );
  assert.equal(
    shouldDimLosingSeat({
      phase: 'hand_end',
      resultPhase: 'showing',
      isWinner: true,
      status: 'active',
    }),
    false,
  );
});

test('getSeatDealOrderIndex starts dealing from the seat after the button', () => {
  assert.equal(getSeatDealOrderIndex([0, 2, 5], 0, 2), 0);
  assert.equal(getSeatDealOrderIndex([0, 2, 5], 0, 5), 1);
  assert.equal(getSeatDealOrderIndex([0, 2, 5], 0, 0), 2);
});

test('getSeatDealOrderIndex falls back to table order when the button is unknown', () => {
  assert.equal(getSeatDealOrderIndex([1, 4, 6], null, 1), 0);
  assert.equal(getSeatDealOrderIndex([1, 4, 6], null, 4), 1);
  assert.equal(getSeatDealOrderIndex([1, 4, 6], null, 6), 2);
});

test('getHoleCardSecondPassDelay scales to active player count instead of max seats', () => {
  assert.equal(getHoleCardSecondPassDelay(2), 0.62);
  assert.equal(getHoleCardSecondPassDelay(6), 0.94);
});

test('getHandResultPhaseTimeline: a showdown waits for the runout, shows cards, then names the winner', () => {
  assert.deepEqual(getHandResultPhaseTimeline({ runoutMs: 1000, isShowdown: true }), {
    revealingMs: 1000,
    showingMs: 1900,
    doneMs: 4400,
    nextHandAutoStartMs: 2000,
  });
});

test('getHandResultPhaseTimeline: an uncontested hand names the winner at once', () => {
  assert.deepEqual(getHandResultPhaseTimeline({ runoutMs: 0, isShowdown: false }), {
    revealingMs: null,
    showingMs: 0,
    doneMs: 2500,
    nextHandAutoStartMs: 2000,
  });
});

test('shouldShowWinnerAnnouncement keeps the banner from the winner reveal until the next hand', () => {
  assert.equal(shouldShowWinnerAnnouncement('announcing'), false);
  assert.equal(shouldShowWinnerAnnouncement('revealing'), false);
  assert.equal(shouldShowWinnerAnnouncement('showing'), true);
  assert.equal(shouldShowWinnerAnnouncement('done'), true);
});

test('shouldAnimatePotAward waits until the reveal phase', () => {
  assert.equal(shouldAnimatePotAward('announcing'), false);
  assert.equal(shouldAnimatePotAward('revealing'), false);
  assert.equal(shouldAnimatePotAward('showing'), true);
  assert.equal(shouldAnimatePotAward('done'), false);
});

test('getDisplayedSeatStack hides awarded chips until the pot ship starts', () => {
  assert.equal(getDisplayedSeatStack(3000, 3000, 'announcing'), 0);
  assert.equal(getDisplayedSeatStack(1670, 320, 'revealing'), 1350);
});

test('getDisplayedSeatStack keeps the settled stack after reveal or without payout', () => {
  assert.equal(getDisplayedSeatStack(3000, 3000, 'showing'), 3000);
  assert.equal(getDisplayedSeatStack(3000, 3000, 'done'), 3000);
  assert.equal(getDisplayedSeatStack(990, undefined, 'announcing'), 990);
});

test('buildCommunityRevealSteps(0, 5): a whole board at once reveals 1..5 in order, one beat per street', () => {
  const steps = buildCommunityRevealSteps(0, 5);
  assert.deepEqual(steps.map((step) => step.count), [1, 2, 3, 4, 5]);
  assert.deepEqual(steps.map((step) => step.delayMs), [0, 160, 320, 1100, 1880]);
  assert.ok(steps.every((step, index) => index === 0 || step.delayMs > steps[index - 1]!.delayMs));
});
