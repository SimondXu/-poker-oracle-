import assert from 'node:assert/strict';
import test from 'node:test';

import type { HandState } from '@aipoker/shared';

import { canRequestNextHand, getStreetHoldHand, mapHandResultToStore, startsNewHand } from './game-socket-controller.ts';

test('mapHandResultToStore aggregates payouts by player and keeps winner ids stable', () => {
  const mapped = mapHandResultToStore({
    fallbackPlayerName: 'Player',
    result: {
      roomId: 'AAAABA',
      phase: 'hand_end',
      potTotal: 600,
      pots: [],
      payouts: [
        { potIndex: 0, playerId: 'p0', amount: 400 },
        { potIndex: 1, playerId: 'p0', amount: 200 },
      ],
      players: [
        { id: 'p0', name: 'Alice', stack: 1200, status: 'active', holeCards: ['As', 'Ad'] },
      ],
      table: {
        activeStackPlayerCount: 2,
        activeHumanStackPlayerCount: 2,
        activeBotStackPlayerCount: 0,
        isTableFinished: false,
        canStartNextHand: true,
        isBotsOnlyContinuation: false,
        championPlayerId: null,
        championPlayerName: null,
      },
      stateVersion: 7,
    },
    currentHand: {
      id: 'hand-1',
      roomId: 'AAAABA',
      handNumber: 3,
      phase: 'hand_end',
      maxSeats: 6,
      smallBlind: 10,
      bigBlind: 20,
      buttonMarkerSeat: 0,
      sbSeat: 0,
      bbSeat: 1,
      players: [
        {
          id: 'p0',
          name: 'Alice',
          seatIndex: 0,
          stack: 1200,
          streetCommitted: 0,
          handCommitted: 0,
          status: 'active',
          holeCards: ['As', 'Ad'],
          isBot: false,
          hasActedThisStreet: true,
          matchedBetToMatchAtLastAction: 20,
        },
      ],
      communityCards: ['Kh', 'Qh', '2c', '7d', '9s'],
      pots: [],
      betting: {
        currentBetToMatch: 0,
        lastFullRaiseSize: 20,
        lastAggressorId: null,
      },
      currentActorSeat: null,
      actions: [],
    },
  });

  assert.deepEqual(mapped.winnerIds, ['p0']);
  assert.equal(mapped.payouts.length, 1);
  assert.equal(mapped.payouts[0]?.amount, 600);
});

test('canRequestNextHand guards disabled or duplicate requests', () => {
  assert.equal(canRequestNextHand({ enabled: true, roomId: 'AAAABA', nextHandRequested: false }), true);
  assert.equal(canRequestNextHand({ enabled: false, roomId: 'AAAABA', nextHandRequested: false }), false);
  assert.equal(canRequestNextHand({ enabled: true, roomId: '', nextHandRequested: false }), false);
  assert.equal(canRequestNextHand({ enabled: true, roomId: 'AAAABA', nextHandRequested: true }), false);
});

function handShell(overrides: Partial<HandState>): HandState {
  return {
    id: 'AAAABA:4',
    roomId: 'AAAABA',
    handNumber: 4,
    phase: 'hand_end',
    maxSeats: 6,
    smallBlind: 10,
    bigBlind: 20,
    buttonMarkerSeat: 0,
    sbSeat: 0,
    bbSeat: 1,
    players: [],
    communityCards: [],
    pots: [],
    betting: { currentBetToMatch: 0, lastFullRaiseSize: 20, lastAggressorId: null },
    currentActorSeat: null,
    actions: [],
    ...overrides,
  };
}

const TABLE = {
  activeStackPlayerCount: 2,
  activeHumanStackPlayerCount: 1,
  activeBotStackPlayerCount: 1,
  isTableFinished: false,
  canStartNextHand: true,
  isBotsOnlyContinuation: false,
  championPlayerId: null,
  championPlayerName: null,
};

test('mapHandResultToStore: preflop fold-out with empty holeCards gives an uncontested payout, no rank', () => {
  const mapped = mapHandResultToStore({
    fallbackPlayerName: 'Player',
    result: {
      roomId: 'AAAABA',
      phase: 'hand_end',
      potTotal: 30,
      pots: [],
      payouts: [{ potIndex: 0, playerId: 'hero', amount: 30 }],
      players: [
        { id: 'hero', name: 'Hero', stack: 1010, status: 'active', holeCards: ['As', 'Ad'] },
        { id: 'bot-tag-1', name: 'Bot', stack: 990, status: 'folded', holeCards: [] },
      ],
      table: TABLE,
      stateVersion: 9,
    },
    currentHand: handShell({ phase: 'hand_end', communityCards: [] }),
  });

  assert.deepEqual(mapped.winnerIds, ['hero']);
  assert.equal(mapped.payouts[0]?.handRankName, '');
  assert.deepEqual(mapped.payouts[0]?.bestCards, []);
});

test('mapHandResultToStore: a payee with no known cards (folded, []) never reaches the evaluator', () => {
  const mapped = mapHandResultToStore({
    fallbackPlayerName: 'Player',
    result: {
      roomId: 'AAAABA',
      phase: 'hand_end',
      potTotal: 40,
      pots: [],
      payouts: [{ potIndex: 0, playerId: 'bot-tag-1', amount: 40 }],
      players: [{ id: 'bot-tag-1', name: 'Bot', stack: 1000, status: 'folded', holeCards: [] }],
      table: TABLE,
      stateVersion: 9,
    },
    currentHand: handShell({ communityCards: ['Kh', 'Qh', '2c', '7d', '9s'] }),
  });
  assert.equal(mapped.payouts[0]?.handRankName, '');
});

test('mapHandResultToStore: all-in at the blinds, five board cards, both hands named', () => {
  const mapped = mapHandResultToStore({
    fallbackPlayerName: 'Player',
    result: {
      roomId: 'AAAABA',
      phase: 'hand_end',
      potTotal: 200,
      pots: [],
      payouts: [{ potIndex: 0, playerId: 'hero', amount: 200 }],
      players: [
        { id: 'hero', name: 'Hero', stack: 200, status: 'all_in', holeCards: ['As', 'Ad'] },
        { id: 'bot-tag-1', name: 'Bot', stack: 0, status: 'all_in', holeCards: ['Kc', '3d'] },
      ],
      table: TABLE,
      stateVersion: 9,
    },
    currentHand: handShell({ communityCards: ['Ah', '7c', '2s', '9h', 'Jd'], actions: [] }),
  });
  assert.equal(mapped.payouts[0]?.handRankName, '三条');
  assert.equal(mapped.payouts[0]?.bestCards.length, 5);
});

test('mapHandResultToStore: unnamed payees use the translated fallback name', () => {
  const mapped = mapHandResultToStore({
    fallbackPlayerName: 'Player',
    result: {
      roomId: 'AAAABA',
      phase: 'hand_end',
      potTotal: 30,
      pots: [],
      payouts: [{ potIndex: 0, playerId: 'ghost', amount: 30 }],
      players: [],
      table: TABLE,
      stateVersion: 9,
    },
    currentHand: null,
  });
  assert.equal(mapped.payouts[0]?.playerName, 'Player');
});

test('startsNewHand: preflop, a different hand, but not the same hand reaching hand_end', () => {
  const previous = handShell({ id: 'AAAABA:3', handNumber: 3, phase: 'hand_end' });
  assert.equal(startsNewHand(previous, handShell({ phase: 'betting_preflop' })), true);
  // New hand that is already over at the blinds: the old result must not carry over.
  assert.equal(startsNewHand(previous, handShell({ id: 'AAAABA:4', handNumber: 4, phase: 'hand_end' })), true);
  // Same hand jumping from preflop straight to hand_end keeps its result.
  const sameHand = handShell({ phase: 'betting_preflop' });
  assert.equal(startsNewHand(sameHand, handShell({ phase: 'hand_end' })), false);
  // First state after (re)connect has nothing to clear.
  assert.equal(startsNewHand(null, handShell({ phase: 'hand_end' })), false);
});

function seat(id: string, seatIndex: number, overrides: Partial<HandState['players'][number]> = {}): HandState['players'][number] {
  return {
    id,
    name: id,
    seatIndex,
    stack: 980,
    streetCommitted: 20,
    handCommitted: 20,
    status: 'active',
    holeCards: [],
    isBot: true,
    hasActedThisStreet: true,
    matchedBetToMatchAtLastAction: 20,
    ...overrides,
  } as HandState['players'][number];
}

function action(playerId: string, type: 'call' | 'fold' | 'check' | 'raise_to', phase: HandState['phase'], addedAmount: number, sequenceNum: number) {
  return {
    playerId, playerName: playerId, seatIndex: 0, phase, type, amount: addedAmount, addedAmount,
    toAmount: addedAmount, stackBefore: 1000, potTotalBefore: 0, sequenceNum, timestamp: 0,
  } as HandState['actions'][number];
}

test('getStreetHoldHand: the call that closes preflop is shown on the old street before the flop', () => {
  const raise = action('a', 'raise_to', 'betting_preflop', 60, 1);
  const previous = handShell({
    phase: 'betting_preflop',
    currentActorSeat: 1,
    actions: [raise],
    players: [seat('a', 0, { stack: 940, streetCommitted: 60, handCommitted: 60 }), seat('b', 1)],
  });
  const closingCall = action('b', 'call', 'betting_preflop', 40, 2);
  const next = handShell({
    phase: 'betting_flop',
    communityCards: ['Ah', 'Kd', '2c'],
    actions: [raise, closingCall],
    players: [seat('a', 0, { stack: 940, streetCommitted: 0, handCommitted: 60 }), seat('b', 1, { stack: 940, streetCommitted: 0, handCommitted: 60 })],
  });

  const held = getStreetHoldHand(previous, next);
  assert.ok(held);
  assert.equal(held.phase, 'betting_preflop');
  assert.deepEqual(held.communityCards, []);
  assert.equal(held.currentActorSeat, null);
  assert.equal(held.actions.at(-1)?.playerId, 'b');
  const caller = held.players.find((player) => player.id === 'b');
  assert.equal(caller?.streetCommitted, 60);
  assert.equal(caller?.stack, 940);
});

test('getStreetHoldHand: a fold that ends the hand is held too, and marks the folder', () => {
  const previous = handShell({ phase: 'betting_flop', currentActorSeat: 1, players: [seat('a', 0), seat('b', 1)] });
  const fold = action('b', 'fold', 'betting_flop', 0, 3);
  const next = handShell({ phase: 'hand_end', actions: [fold], players: [seat('a', 0), seat('b', 1, { status: 'folded' })] });
  assert.equal(getStreetHoldHand(previous, next)?.players.find((player) => player.id === 'b')?.status, 'folded');
});

test('getStreetHoldHand: no hold inside a street, across hands, or when updates were missed', () => {
  const previous = handShell({ phase: 'betting_flop', players: [seat('a', 0), seat('b', 1)] });
  const check = action('a', 'check', 'betting_flop', 0, 1);
  assert.equal(getStreetHoldHand(previous, handShell({ phase: 'betting_flop', actions: [check] })), null);
  assert.equal(getStreetHoldHand(previous, handShell({ id: 'AAAABA:5', handNumber: 5, phase: 'betting_preflop' })), null);
  const two = [check, action('b', 'check', 'betting_flop', 0, 2)];
  assert.equal(getStreetHoldHand(previous, handShell({ phase: 'betting_turn', actions: two.concat(action('a', 'check', 'betting_turn', 0, 3)) })), null);
  assert.equal(getStreetHoldHand(null, handShell({ phase: 'betting_turn', actions: [check] })), null);
});
