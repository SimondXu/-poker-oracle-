import assert from 'node:assert/strict';
import test from 'node:test';
import type { HandState } from '@aipoker/shared';

import { getTrainingData } from './training-analysis.ts';

/** Heads-up flop, nobody has bet yet, the hero (p0) holds top set on a dry board. */
const unopenedFlop: HandState = {
  id: 'hand-1',
  roomId: 'AAAABA',
  handNumber: 3,
  phase: 'betting_flop',
  maxSeats: 6,
  smallBlind: 10,
  bigBlind: 20,
  buttonMarkerSeat: 1,
  sbSeat: 1,
  bbSeat: 0,
  players: [
    {
      id: 'p0',
      name: 'Alice',
      seatIndex: 0,
      stack: 940,
      streetCommitted: 0,
      handCommitted: 60,
      status: 'active',
      holeCards: ['As', 'Ad'],
      isBot: false,
      hasActedThisStreet: false,
      matchedBetToMatchAtLastAction: 0,
    },
    {
      id: 'p1',
      name: 'Bob',
      seatIndex: 1,
      stack: 940,
      streetCommitted: 0,
      handCommitted: 60,
      status: 'active',
      holeCards: [],
      isBot: true,
      hasActedThisStreet: false,
      matchedBetToMatchAtLastAction: 0,
    },
  ],
  communityCards: ['Ah', '7c', '2d'],
  pots: [{ amount: 120, eligiblePlayerIds: ['p0', 'p1'] }],
  betting: { currentBetToMatch: 0, lastFullRaiseSize: 20, lastAggressorId: null },
  currentActorSeat: 0,
  actions: [],
};

test('getTrainingData can suggest a bet on an unopened street, where the server sends canBet, not canRaise', () => {
  const data = getTrainingData({
    currentUserId: 'p0',
    hand: unopenedFlop,
    isMyTurn: true,
    validActions: {
      canFold: false,
      canCheck: true,
      canCall: false,
      callAmount: 0,
      canBet: true,
      canRaise: false,
      minBetOrRaiseTo: 20,
      maxBetOrRaiseTo: 940,
      canAllIn: true,
    },
  });

  assert.equal(data?.suggestion, 'raise');
});
