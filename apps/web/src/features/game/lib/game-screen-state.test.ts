import assert from 'node:assert/strict';
import test from 'node:test';

import { getGameFooterMode, getGameScreenState } from './game-screen-state.ts';

test('getGameScreenState derives turn state, pot size, and training suggestion', () => {
  const state = getGameScreenState({
    currentUserId: 'p0',
    eliminatedDecision: null,
    hand: {
      id: 'hand-1',
      roomId: 'AAAABA',
      handNumber: 3,
      phase: 'betting_preflop',
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
          stack: 980,
          streetCommitted: 10,
          handCommitted: 10,
          status: 'active',
          holeCards: ['As', 'Kd'],
          isBot: false,
          hasActedThisStreet: false,
          matchedBetToMatchAtLastAction: 10,
        },
        {
          id: 'p1',
          name: 'Bob',
          seatIndex: 1,
          stack: 960,
          streetCommitted: 20,
          handCommitted: 20,
          status: 'active',
          holeCards: [],
          isBot: false,
          hasActedThisStreet: false,
          matchedBetToMatchAtLastAction: 20,
        },
      ],
      communityCards: [],
      pots: [{ amount: 15, eligiblePlayerIds: ['p0', 'p1'] }],
      betting: {
        currentBetToMatch: 20,
        lastFullRaiseSize: 20,
        lastAggressorId: null,
      },
      currentActorSeat: 0,
      actions: [],
    },
    handResult: null,
    validActions: {
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 10,
      canBet: false,
      canRaise: true,
      minBetOrRaiseTo: 40,
      maxBetOrRaiseTo: 980,
      canAllIn: true,
    },
    championInfo: null,
  });

  assert.equal(state.isMyTurn, true);
  assert.equal(state.pot, 30);
  assert.equal(state.trainingData?.suggestion, 'call');
});

test('getGameFooterMode distinguishes eliminated choice from next-hand controls', () => {
  assert.equal(
    getGameFooterMode({
      hasHand: true,
      isMyTurn: false,
      hasValidActions: false,
      isEliminatedPendingChoice: true,
      isResultPresentationActive: false,
      canCurrentUserStartNextHand: false,
      isEliminatedSpectating: false,
      isTableFinished: false,
      handPhase: 'hand_end',
    }),
    'eliminated-choice',
  );

  assert.equal(
    getGameFooterMode({
      hasHand: true,
      isMyTurn: false,
      hasValidActions: false,
      isEliminatedPendingChoice: false,
      isResultPresentationActive: false,
      canCurrentUserStartNextHand: true,
      isEliminatedSpectating: false,
      isTableFinished: false,
      handPhase: 'hand_end',
    }),
    'next-hand',
  );
});
