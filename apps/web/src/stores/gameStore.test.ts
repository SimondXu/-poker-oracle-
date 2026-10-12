import assert from 'node:assert/strict';
import test from 'node:test';
import type { CoachAdvice, HandState, ValidActions } from '@aipoker/shared';

import { useGameStore } from './gameStore.ts';

const VALID: ValidActions = {
  canFold: true,
  canCheck: false,
  canCall: true,
  callAmount: 20,
  canBet: false,
  canRaise: true,
  minBetOrRaiseTo: 40,
  maxBetOrRaiseTo: 1_000,
  canAllIn: true,
};

const advice = { stateVersion: 7 } as CoachAdvice;
const coachEvent = (stateVersion: number) => ({ roomId: 'R', playerId: 'p0', stateVersion, advice });

test('coach advice is kept only for the open decision it was built for', () => {
  const store = useGameStore.getState();
  store.reset();
  store.setHandState({} as HandState, 7);

  // No decision open yet: dropped.
  store.setCoach(coachEvent(7));
  assert.equal(useGameStore.getState().coach, null);

  store.setValidActions(VALID, 30_000);
  // From an earlier state: dropped.
  store.setCoach(coachEvent(6));
  assert.equal(useGameStore.getState().coach, null);
  store.setCoach(coachEvent(7));
  assert.equal(useGameStore.getState().coach, advice);

  // The hero acted: the advice goes with the decision, and a late one is not taken back.
  store.clearValidActions();
  assert.equal(useGameStore.getState().coach, null);
  store.setCoach(coachEvent(7));
  assert.equal(useGameStore.getState().coach, null);

  // A new decision starts without advice until its own arrives.
  store.setValidActions(VALID, 30_000);
  assert.equal(useGameStore.getState().coach, null);
});
