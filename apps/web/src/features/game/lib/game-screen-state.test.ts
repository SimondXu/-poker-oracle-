import assert from 'node:assert/strict';
import test from 'node:test';

import { canAdvanceToNextHand, getGameFooterMode, getGameScreenState } from './game-screen-state.ts';

test('getGameScreenState derives rich hero-turn training data', () => {
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
  assert.equal(state.trainingData?.position, 'BTN');
  assert.equal(state.trainingData?.strength?.kind, 'top_percent');
  assert.equal(state.trainingData?.suggestion, 'raise');
  assert.ok((state.trainingData?.suggestionReason ?? '').length > 0);
});

test('getGameScreenState keeps only static training context when it is not my turn', () => {
  const state = getGameScreenState({
    currentUserId: 'p0',
    eliminatedDecision: null,
    hand: {
      id: 'hand-2',
      roomId: 'AAAABA',
      handNumber: 4,
      phase: 'betting_flop',
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
          stack: 940,
          streetCommitted: 0,
          handCommitted: 60,
          status: 'active',
          holeCards: ['Ah', 'Qh'],
          isBot: false,
          hasActedThisStreet: true,
          matchedBetToMatchAtLastAction: 60,
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
          isBot: false,
          hasActedThisStreet: false,
          matchedBetToMatchAtLastAction: 60,
        },
      ],
      communityCards: ['Kh', '7h', '2c'],
      pots: [{ amount: 120, eligiblePlayerIds: ['p0', 'p1'] }],
      betting: {
        currentBetToMatch: 0,
        lastFullRaiseSize: 20,
        lastAggressorId: 'p0',
      },
      currentActorSeat: 1,
      actions: [
        {
          playerId: 'p0',
          playerName: 'Alice',
          seatIndex: 0,
          phase: 'betting_preflop',
          type: 'raise_to',
          amount: 40,
          addedAmount: 40,
          toAmount: 40,
          stackBefore: 980,
          potTotalBefore: 30,
          sequenceNum: 1,
          timestamp: 1,
        },
      ],
    },
    handResult: null,
    validActions: null,
    championInfo: null,
  });

  assert.equal(state.isMyTurn, false);
  assert.equal(state.trainingData?.position, 'BTN');
  assert.equal(state.trainingData?.strength?.kind, 'equity');
  assert.equal(state.trainingData?.suggestion, undefined);
  assert.equal(state.trainingData?.potOdds, undefined);
});

test('getGameScreenState derives position labels from occupied seats instead of raw max-seat offsets', () => {
  const state = getGameScreenState({
    currentUserId: 'p5',
    eliminatedDecision: null,
    hand: {
      id: 'hand-3',
      roomId: 'AAAABA',
      handNumber: 5,
      phase: 'betting_preflop',
      maxSeats: 6,
      smallBlind: 10,
      bigBlind: 20,
      buttonMarkerSeat: 0,
      sbSeat: 2,
      bbSeat: 5,
      players: [
        {
          id: 'p0',
          name: 'Alice',
          seatIndex: 0,
          stack: 980,
          streetCommitted: 0,
          handCommitted: 0,
          status: 'active',
          holeCards: [],
          isBot: false,
          hasActedThisStreet: false,
          matchedBetToMatchAtLastAction: 0,
        },
        {
          id: 'p2',
          name: 'Bob',
          seatIndex: 2,
          stack: 990,
          streetCommitted: 10,
          handCommitted: 10,
          status: 'active',
          holeCards: [],
          isBot: false,
          hasActedThisStreet: false,
          matchedBetToMatchAtLastAction: 10,
        },
        {
          id: 'p5',
          name: 'Carol',
          seatIndex: 5,
          stack: 980,
          streetCommitted: 20,
          handCommitted: 20,
          status: 'active',
          holeCards: ['Ah', 'Kd'],
          isBot: false,
          hasActedThisStreet: false,
          matchedBetToMatchAtLastAction: 20,
        },
      ],
      communityCards: [],
      pots: [{ amount: 30, eligiblePlayerIds: ['p0', 'p2', 'p5'] }],
      betting: {
        currentBetToMatch: 20,
        lastFullRaiseSize: 20,
        lastAggressorId: null,
      },
      currentActorSeat: 5,
      actions: [
        {
          playerId: 'p0',
          playerName: 'Alice',
          seatIndex: 0,
          phase: 'betting_preflop',
          type: 'call',
          amount: 20,
          addedAmount: 20,
          toAmount: 20,
          stackBefore: 1000,
          potTotalBefore: 30,
          sequenceNum: 1,
          timestamp: 1,
        },
      ],
    },
    handResult: null,
    validActions: {
      canFold: true,
      canCheck: true,
      canCall: false,
      callAmount: 0,
      canBet: false,
      canRaise: true,
      minBetOrRaiseTo: 60,
      maxBetOrRaiseTo: 980,
      canAllIn: true,
    },
    championInfo: null,
  });

  assert.equal(state.positionLabel, 'BB');
  assert.equal(state.trainingData?.position, 'BB');
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

test('canAdvanceToNextHand waits until result presentation is fully done', () => {
  assert.equal(
    canAdvanceToNextHand({
      handPhase: 'hand_end',
      handResultPhase: 'revealing',
      canCurrentUserStartNextHand: true,
    }),
    false,
  );

  assert.equal(
    canAdvanceToNextHand({
      handPhase: 'hand_end',
      handResultPhase: 'showing',
      canCurrentUserStartNextHand: true,
    }),
    false,
  );

  assert.equal(
    canAdvanceToNextHand({
      handPhase: 'hand_end',
      handResultPhase: 'done',
      canCurrentUserStartNextHand: true,
    }),
    true,
  );

  assert.equal(
    canAdvanceToNextHand({
      handPhase: 'betting_river',
      handResultPhase: 'done',
      canCurrentUserStartNextHand: true,
    }),
    false,
  );
});
