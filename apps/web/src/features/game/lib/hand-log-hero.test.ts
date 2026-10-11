import assert from 'node:assert/strict';
import test from 'node:test';

import type { GameAction, HandState, Phase, PlayerState } from '@aipoker/shared';

import { summarizeHeroHand } from './hand-log-hero.ts';

function player(id: string, seatIndex: number, handCommitted: number, status: PlayerState['status'] = 'active'): PlayerState {
  return {
    id,
    name: id,
    seatIndex,
    stack: 1000,
    streetCommitted: 0,
    handCommitted,
    status,
    holeCards: [],
    isBot: id !== 'hero',
    hasActedThisStreet: false,
    matchedBetToMatchAtLastAction: 0,
  };
}

function fold(playerId: string, phase: Phase): GameAction {
  return {
    playerId,
    playerName: playerId,
    seatIndex: 0,
    phase,
    type: 'fold',
    amount: 0,
    addedAmount: 0,
    toAmount: 0,
    stackBefore: 1000,
    potTotalBefore: 0,
    sequenceNum: 1,
    timestamp: 1,
  };
}

function makeHand(players: PlayerState[], actions: GameAction[] = []): HandState {
  return {
    id: 'h1',
    roomId: 'room-1',
    handNumber: 3,
    phase: 'hand_end',
    maxSeats: 9,
    smallBlind: 10,
    bigBlind: 20,
    buttonMarkerSeat: 0,
    sbSeat: 1,
    bbSeat: 2,
    players,
    communityCards: [],
    pots: [],
    betting: { currentBetToMatch: 0, lastFullRaiseSize: 20, lastAggressorId: null },
    currentActorSeat: null,
    actions,
  };
}

const payout = (playerId: string, amount: number, handRankName = '') => ({ playerId, playerName: playerId, amount, handRankName, bestCards: [] });

test('a fold on the turn that cost chips is a loss tagged with the street', () => {
  const hand = makeHand([player('hero', 0, 120, 'folded'), player('bot', 1, 240)], [fold('hero', 'betting_turn')]);
  const summary = summarizeHeroHand(hand, { potTotal: 360, payouts: [payout('bot', 360)] }, 'hero');
  assert.deepEqual(summary, { outcome: 'lost', net: -120, foldedStreet: 'turn', handRank: null, uncontested: false });
});

test('a showdown win reports net chips and the hand name', () => {
  const hand = makeHand([player('hero', 0, 130), player('bot', 1, 130)]);
  const summary = summarizeHeroHand(hand, { potTotal: 260, payouts: [payout('hero', 260, '一对')] }, 'hero');
  assert.deepEqual(summary, { outcome: 'won', net: 130, foldedStreet: null, handRank: '一对', uncontested: false });
});

test('winning because everyone folded is uncontested', () => {
  const hand = makeHand([player('hero', 0, 60), player('bot', 1, 20, 'folded')]);
  const summary = summarizeHeroHand(hand, { potTotal: 80, payouts: [payout('hero', 80)] }, 'hero');
  assert.equal(summary?.outcome, 'won');
  assert.equal(summary?.net, 20);
  assert.equal(summary?.uncontested, true);
});

test('a chopped pot that returns exactly the stake is even', () => {
  const hand = makeHand([player('hero', 0, 100), player('bot', 1, 100)]);
  const summary = summarizeHeroHand(hand, { potTotal: 200, payouts: [payout('hero', 100, '顺子'), payout('bot', 100, '顺子')] }, 'hero');
  assert.equal(summary?.outcome, 'even');
});

test('spectators, eliminated players and unknown hero ids get no summary', () => {
  const hand = makeHand([player('hero', 0, 0, 'out'), player('bot', 1, 40)]);
  const result = { potTotal: 40, payouts: [payout('bot', 40)] };
  assert.equal(summarizeHeroHand(hand, result, 'hero'), null);
  assert.equal(summarizeHeroHand(hand, result, 'nobody'), null);
  assert.equal(summarizeHeroHand(hand, result, null), null);
});
