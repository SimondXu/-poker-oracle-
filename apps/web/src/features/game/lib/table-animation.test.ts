import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCommunityRevealSteps,
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

test('buildCommunityRevealSteps staggers a flop reveal card by card', () => {
  assert.deepEqual(buildCommunityRevealSteps(0, 3), [
    { count: 1, delayMs: 180 },
    { count: 2, delayMs: 340 },
    { count: 3, delayMs: 500 },
  ]);
});

test('buildCommunityRevealSteps keeps turn and river as separate beats', () => {
  assert.deepEqual(buildCommunityRevealSteps(3, 5), [
    { count: 4, delayMs: 780 },
    { count: 5, delayMs: 1560 },
  ]);
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

test('getHandResultPhaseTimeline adds a reveal beat before the winner presentation', () => {
  assert.deepEqual(getHandResultPhaseTimeline(), {
    revealingMs: 1400,
    showingMs: 2300,
    doneMs: 5200,
    nextHandAutoStartMs: 2000,
  });
});

test('shouldShowWinnerAnnouncement waits until the reveal phase', () => {
  assert.equal(shouldShowWinnerAnnouncement('announcing'), false);
  assert.equal(shouldShowWinnerAnnouncement('revealing'), false);
  assert.equal(shouldShowWinnerAnnouncement('showing'), true);
  assert.equal(shouldShowWinnerAnnouncement('done'), false);
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
