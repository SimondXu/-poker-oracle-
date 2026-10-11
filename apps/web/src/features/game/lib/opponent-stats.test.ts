import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActionType, GameAction, HandState, Phase, PlayerState } from '@aipoker/shared';

import {
  computeOpponentStats,
  MIN_HANDS_FOR_STATS,
  observeHand,
  recordObservation,
  type HandObservation,
} from './opponent-stats.ts';

function player(id: string, seatIndex: number, status: PlayerState['status'] = 'active'): PlayerState {
  return {
    id,
    name: id,
    seatIndex,
    stack: 1000,
    streetCommitted: 0,
    handCommitted: 0,
    status,
    holeCards: [],
    isBot: true,
    hasActedThisStreet: false,
    matchedBetToMatchAtLastAction: 0,
  };
}

let seq = 0;
function act(playerId: string, phase: Phase, type: ActionType, toAmount = 0): GameAction {
  seq += 1;
  return {
    playerId,
    playerName: playerId,
    seatIndex: 0,
    phase,
    type,
    amount: toAmount,
    addedAmount: toAmount,
    toAmount,
    stackBefore: 1000,
    potTotalBefore: 0,
    sequenceNum: seq,
    timestamp: seq,
  };
}

function hand(handNumber: number, actions: GameAction[], overrides: Partial<HandState> = {}): HandState {
  return {
    id: `h${handNumber}`,
    roomId: 'room-1',
    handNumber,
    phase: 'hand_end',
    maxSeats: 9,
    smallBlind: 10,
    bigBlind: 20,
    buttonMarkerSeat: 0,
    sbSeat: 1,
    bbSeat: 2,
    players: [player('a', 0), player('b', 1), player('c', 2)],
    communityCards: [],
    pots: [],
    betting: { currentBetToMatch: 0, lastFullRaiseSize: 20, lastAggressorId: null },
    currentActorSeat: null,
    actions,
    ...overrides,
  };
}

test('only finished hands are observed', () => {
  assert.equal(observeHand(hand(1, [], { phase: 'betting_flop' })), null);
});

test('VPIP counts calls and raises preflop, not folds or the big blind check', () => {
  const observation = observeHand(
    hand(1, [
      act('a', 'betting_preflop', 'raise_to', 60),
      act('b', 'betting_preflop', 'fold'),
      act('c', 'betting_preflop', 'call', 60),
    ]),
  )!;
  assert.deepEqual([observation.players.a?.vpip, observation.players.b?.vpip, observation.players.c?.vpip], [true, false, true]);
  assert.deepEqual([observation.players.a?.pfr, observation.players.b?.pfr, observation.players.c?.pfr], [true, false, false]);

  const checked = observeHand(hand(2, [act('a', 'betting_preflop', 'fold'), act('b', 'betting_preflop', 'call', 20), act('c', 'betting_preflop', 'check')]))!;
  assert.equal(checked.players.c?.vpip, false);
  assert.equal(checked.players.b?.vpip, true);
});

test('an all-in below the current bet is a call, above it is a raise', () => {
  const observation = observeHand(
    hand(1, [
      act('a', 'betting_preflop', 'raise_to', 100),
      act('b', 'betting_preflop', 'all_in', 80),
      act('c', 'betting_preflop', 'all_in', 400),
    ]),
  )!;
  assert.deepEqual([observation.players.b?.vpip, observation.players.b?.pfr], [true, false]);
  assert.deepEqual([observation.players.c?.vpip, observation.players.c?.pfr], [true, true]);
});

test('postflop: bets and raises are aggressive, calls and folds passive, checks ignored', () => {
  const observation = observeHand(
    hand(1, [
      act('a', 'betting_flop', 'check'),
      act('b', 'betting_flop', 'bet', 40),
      act('a', 'betting_flop', 'raise_to', 120),
      act('b', 'betting_flop', 'call', 120),
      act('a', 'betting_turn', 'check'),
      act('b', 'betting_turn', 'all_in', 300),
      act('a', 'betting_turn', 'fold'),
    ]),
  )!;
  assert.deepEqual([observation.players.a?.aggressive, observation.players.a?.passive], [1, 1]);
  assert.deepEqual([observation.players.b?.aggressive, observation.players.b?.passive], [2, 1]);
});

test('eliminated and sitting-out players are not dealt in', () => {
  const observation = observeHand(hand(1, [], { players: [player('a', 0), player('b', 1, 'out'), player('c', 2, 'sitting_out')] }))!;
  assert.deepEqual([observation.players.a?.dealtIn, observation.players.b?.dealtIn, observation.players.c?.dealtIn], [true, false, false]);
});

function sessionOf(count: number, perHand: (n: number) => GameAction[]): HandObservation[] {
  let observations: readonly HandObservation[] = [];
  for (let n = 1; n <= count; n += 1) observations = recordObservation(observations, observeHand(hand(n, perHand(n)))!);
  return [...observations];
}

test('stats stay null below the minimum sample', () => {
  const observations = sessionOf(MIN_HANDS_FOR_STATS - 1, () => [act('a', 'betting_preflop', 'raise_to', 60)]);
  assert.deepEqual(computeOpponentStats(observations, 'a', 'room-1'), {
    hands: MIN_HANDS_FOR_STATS - 1,
    vpip: null,
    pfr: null,
    aggression: null,
  });
});

test('stats are fractions of seen hands once the sample is big enough', () => {
  const observations = sessionOf(10, (n) => [
    // a raises 4 of 10 hands and calls 2 more; b only folds.
    ...(n <= 4 ? [act('a', 'betting_preflop', 'raise_to', 60)] : n <= 6 ? [act('a', 'betting_preflop', 'call', 20)] : [act('a', 'betting_preflop', 'fold')]),
    act('b', 'betting_preflop', 'fold'),
    ...(n === 1 ? [act('a', 'betting_flop', 'bet', 30), act('b', 'betting_flop', 'call', 30), act('a', 'betting_turn', 'bet', 60), act('b', 'betting_turn', 'fold')] : []),
  ]);
  const a = computeOpponentStats(observations, 'a', 'room-1');
  assert.equal(a.hands, 10);
  assert.equal(a.vpip, 0.6);
  assert.equal(a.pfr, 0.4);
  assert.equal(a.aggression, 1);
  const b = computeOpponentStats(observations, 'b', 'room-1');
  assert.equal(b.vpip, 0);
  assert.equal(b.aggression, 0);
});

test('aggression stays null when the player never acted postflop', () => {
  const observations = sessionOf(6, () => [act('a', 'betting_preflop', 'fold')]);
  assert.equal(computeOpponentStats(observations, 'a', 'room-1').aggression, null);
});

test('a player not seen in the room has no hands, and other rooms are ignored', () => {
  const observations = sessionOf(6, () => [act('a', 'betting_preflop', 'fold')]);
  assert.equal(computeOpponentStats(observations, 'zzz', 'room-1').hands, 0);
  assert.equal(computeOpponentStats(observations, 'a', 'room-2').hands, 0);
});

test('recording is idempotent and a room switch drops the previous room', () => {
  const first = recordObservation([], observeHand(hand(1, []))!);
  assert.equal(recordObservation(first, observeHand(hand(1, []))!), first);
  const other = recordObservation(first, { ...observeHand(hand(1, []))!, roomId: 'room-2' });
  assert.deepEqual(other.map((entry) => entry.roomId), ['room-2']);
});
