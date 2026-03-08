import assert from 'node:assert/strict';
import test from 'node:test';

import type { HandActionRecord, HandInitPlayerState, HandState } from '@aipoker/game-engine';
import type { BotAction, BotDecisionContext, BotPersonality } from '@aipoker/shared';

import {
  createBotStatTracker,
  recordBotDecisionStats,
  recordBotHandResultStats,
  startTrackedHand,
  summarizeBotStats,
} from '../../../game-loop/bot-simulator.ts';

function makePlayer(id: string, seatIndex: number): HandInitPlayerState {
  return {
    id,
    seatIndex,
    stack: 1000,
    streetCommitted: 0,
    handCommitted: 0,
    status: 'active',
    holeCards: ['Ah', 'Kd'],
    hasActedThisStreet: false,
    matchedBetToMatchAtLastAction: 0,
  };
}

function makeHand(overrides: Partial<HandState> = {}): HandState {
  return {
    phase: 'betting_preflop',
    blinds: {
      smallBlind: 10,
      bigBlind: 20,
    },
    players: [makePlayer('p0', 0), makePlayer('p1', 1)],
    buttonMarkerSeat: 0,
    sbSeat: 0,
    bbSeat: 1,
    currentActorSeat: 0,
    pendingActorIds: [],
    communityCards: [],
    deck: [],
    potTotal: 30,
    pots: [],
    payouts: [],
    actions: [],
    betting: {
      currentBetToMatch: 20,
      lastFullRaiseSize: 20,
      lastAggressorId: 'p1',
    },
    ...overrides,
  };
}

function makeContext(overrides: Partial<BotDecisionContext> = {}): BotDecisionContext {
  return {
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 40,
    canRaise: true,
    minRaiseTo: 120,
    maxRaiseTo: 1000,
    canAllIn: true,
    phase: 'preflop',
    potTotal: 60,
    myStack: 960,
    holeCards: ['Ah', 'Kd'],
    communityCards: [],
    activePlayerCount: 2,
    opponentCount: 1,
    position: 'btn',
    effectiveStack: 1000,
    effectiveStackBb: 50,
    spr: 10,
    bettingState: 'unopened',
    isPreflopAggressor: false,
    isLastStreetAggressor: false,
    ...overrides,
  };
}

function makeActionRecord(overrides: Partial<HandActionRecord> = {}): HandActionRecord {
  return {
    playerId: 'p1',
    type: 'raise_to',
    amount: 60,
    addedAmount: 60,
    toAmount: 60,
    phase: 'betting_preflop',
    stackBefore: 1000,
    potTotalBefore: 30,
    timestamp: 1,
    ...overrides,
  };
}

function makeBotAction(type: BotAction['type']): BotAction {
  switch (type) {
    case 'call':
      return { type, amount: 40, thinkingDelayMs: 1 };
    case 'raise_to':
      return { type, amount: 120, thinkingDelayMs: 1 };
    default:
      return { type, thinkingDelayMs: 1 } as BotAction;
  }
}

function createTracker(personality: BotPersonality = 'tag') {
  return createBotStatTracker([
    { id: 'p0', personality },
    { id: 'p1', personality: 'lag' },
  ]);
}

test('bot simulator tracks vpip, pfr, and button RFI opportunities', () => {
  const tracker = createTracker();
  const hand = makeHand();

  startTrackedHand(tracker, hand);
  recordBotDecisionStats(tracker, {
    playerId: 'p0',
    hand,
    context: makeContext({
      phase: 'preflop',
      position: 'btn',
      bettingState: 'unopened',
      activePlayerCount: 2,
      opponentCount: 1,
    }),
    action: makeBotAction('raise_to'),
  });

  const summary = summarizeBotStats(tracker);
  assert.equal(summary.players.p0?.vpip.count, 1);
  assert.equal(summary.players.p0?.pfr.count, 1);
  assert.equal(summary.players.p0?.rfiByPosition.btn?.opportunities, 1);
  assert.equal(summary.players.p0?.rfiByPosition.btn?.count, 1);
});

test('bot simulator tracks fold-to-open and 3bet opportunities separately', () => {
  const foldTracker = createTracker();
  const facingOpenHand = makeHand({
    actions: [makeActionRecord()],
    potTotal: 90,
  });

  startTrackedHand(foldTracker, facingOpenHand);
  recordBotDecisionStats(foldTracker, {
    playerId: 'p0',
    hand: facingOpenHand,
    context: makeContext({
      phase: 'preflop',
      position: 'bb',
      bettingState: 'facing_open',
      activePlayerCount: 2,
      opponentCount: 1,
      callAmount: 40,
      potTotal: 90,
    }),
    action: makeBotAction('fold'),
  });

  const foldSummary = summarizeBotStats(foldTracker);
  assert.equal(foldSummary.players.p0?.foldToOpen.opportunities, 1);
  assert.equal(foldSummary.players.p0?.foldToOpen.count, 1);

  const threeBetTracker = createTracker('lag');
  startTrackedHand(threeBetTracker, facingOpenHand);
  recordBotDecisionStats(threeBetTracker, {
    playerId: 'p0',
    hand: facingOpenHand,
    context: makeContext({
      phase: 'preflop',
      position: 'btn',
      bettingState: 'facing_open',
      activePlayerCount: 2,
      opponentCount: 1,
      callAmount: 40,
      potTotal: 90,
    }),
    action: makeBotAction('raise_to'),
  });

  const threeBetSummary = summarizeBotStats(threeBetTracker);
  assert.equal(threeBetSummary.players.p0?.threeBet.opportunities, 1);
  assert.equal(threeBetSummary.players.p0?.threeBet.count, 1);
});

test('bot simulator keeps tracking later actions within the same hand after state changes', () => {
  const tracker = createTracker();
  const hand = makeHand();

  startTrackedHand(tracker, hand);
  recordBotDecisionStats(tracker, {
    playerId: 'p0',
    hand,
    context: makeContext({
      phase: 'preflop',
      position: 'btn',
      bettingState: 'unopened',
    }),
    action: makeBotAction('raise_to'),
  });

  const progressedHand = makeHand({
    potTotal: 90,
    actions: [makeActionRecord({ playerId: 'p0', amount: 60, addedAmount: 60, toAmount: 60 })],
    players: [
      { ...makePlayer('p0', 0), stack: 940, handCommitted: 60 },
      { ...makePlayer('p1', 1), stack: 990, handCommitted: 10 },
    ],
  });

  recordBotDecisionStats(tracker, {
    playerId: 'p1',
    hand: progressedHand,
    context: makeContext({
      phase: 'preflop',
      position: 'bb',
      bettingState: 'facing_open',
      potTotal: 90,
      callAmount: 40,
    }),
    action: makeBotAction('call'),
  });

  const summary = summarizeBotStats(tracker);
  assert.equal(summary.players.p0?.pfr.count, 1);
  assert.equal(summary.players.p1?.vpip.count, 1);
  assert.equal(summary.players.p1?.foldToOpen.opportunities, 1);
});

test('bot simulator tracks cbet and fold-to-cbet opportunities on the flop', () => {
  const cbetTracker = createTracker();
  const cbetHand = makeHand({
    phase: 'betting_flop',
    communityCards: ['7s', '2c', '9d'],
    actions: [
      makeActionRecord({ playerId: 'p0', amount: 60, addedAmount: 60, toAmount: 60, phase: 'betting_preflop' }),
    ],
    betting: {
      currentBetToMatch: 0,
      lastFullRaiseSize: 60,
      lastAggressorId: 'p0',
    },
  });

  startTrackedHand(cbetTracker, cbetHand);
  recordBotDecisionStats(cbetTracker, {
    playerId: 'p0',
    hand: cbetHand,
    context: makeContext({
      phase: 'flop',
      canCheck: true,
      canCall: false,
      callAmount: 0,
      position: 'btn',
      communityCards: ['7s', '2c', '9d'],
      bettingState: 'unopened',
      activePlayerCount: 2,
      opponentCount: 1,
      isPreflopAggressor: true,
    }),
    action: makeBotAction('raise_to'),
  });

  const foldToCbetTracker = createTracker();
  const foldToCbetHand = makeHand({
    phase: 'betting_flop',
    communityCards: ['7s', '2c', '9d'],
    actions: [
      makeActionRecord({ playerId: 'p1', amount: 60, addedAmount: 60, toAmount: 60, phase: 'betting_preflop' }),
      makeActionRecord({ playerId: 'p1', amount: 40, addedAmount: 40, toAmount: 40, phase: 'betting_flop' }),
    ],
    potTotal: 130,
    betting: {
      currentBetToMatch: 40,
      lastFullRaiseSize: 40,
      lastAggressorId: 'p1',
    },
  });

  startTrackedHand(foldToCbetTracker, foldToCbetHand);
  recordBotDecisionStats(foldToCbetTracker, {
    playerId: 'p0',
    hand: foldToCbetHand,
    context: makeContext({
      phase: 'flop',
      position: 'bb',
      communityCards: ['7s', '2c', '9d'],
      bettingState: 'facing_open',
      activePlayerCount: 2,
      opponentCount: 1,
      potTotal: 130,
      callAmount: 40,
      isPreflopAggressor: false,
    }),
    action: makeBotAction('fold'),
  });

  const cbetSummary = summarizeBotStats(cbetTracker);
  assert.equal(cbetSummary.players.p0?.cbet.opportunities, 1);
  assert.equal(cbetSummary.players.p0?.cbet.count, 1);

  const foldSummary = summarizeBotStats(foldToCbetTracker);
  assert.equal(foldSummary.players.p0?.foldToCbet.opportunities, 1);
  assert.equal(foldSummary.players.p0?.foldToCbet.count, 1);
});

test('bot simulator tracks showdown participation and wins', () => {
  const tracker = createTracker();
  const hand = makeHand({
    phase: 'hand_end',
    communityCards: ['7s', '2c', '9d', 'Th', 'Ac'],
    players: [
      { ...makePlayer('p0', 0), status: 'active' },
      { ...makePlayer('p1', 1), status: 'folded' },
    ],
    payouts: [{ potIndex: 0, playerId: 'p0', amount: 120 }],
  });

  startTrackedHand(tracker, hand);
  recordBotHandResultStats(tracker, hand);

  const summary = summarizeBotStats(tracker);
  assert.equal(summary.players.p0?.wentToShowdown.opportunities, 1);
  assert.equal(summary.players.p0?.wentToShowdown.count, 1);
  assert.equal(summary.players.p0?.wonAtShowdown.opportunities, 1);
  assert.equal(summary.players.p0?.wonAtShowdown.count, 1);
});
