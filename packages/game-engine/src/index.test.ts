import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAction as applyActionBase,
  buildSidePots,
  createDeck,
  evaluateBestSevenCards,
  getValidActions,
  initializeHand,
  settleShowdownPots,
} from './index.ts';

type ApplyActionAllowsUndefinedContext =
  undefined extends Parameters<typeof applyActionBase>[2] ? true : false;

const APPLY_ACTION_REQUIRES_CONTEXT: ApplyActionAllowsUndefinedContext = false;
void APPLY_ACTION_REQUIRES_CONTEXT;

function applyAction(
  state: Parameters<typeof applyActionBase>[0],
  action: Parameters<typeof applyActionBase>[1],
  timestamp = 0,
): ReturnType<typeof applyActionBase> {
  return applyActionBase(state, action, { timestamp });
}

function sequenceRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('createDeck returns deterministic shuffled 52-card deck with injected rng', () => {
  const deckA = createDeck(sequenceRng(123));
  const deckB = createDeck(sequenceRng(123));
  const deckC = createDeck(sequenceRng(456));

  assert.equal(deckA.length, 52);
  assert.equal(new Set(deckA).size, 52);
  assert.deepEqual(deckA, deckB);
  assert.notDeepEqual(deckA, deckC);
});

test('createDeck never reads Math.random', () => {
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error('Math.random must not be called in game-engine');
  };

  try {
    assert.doesNotThrow(() => {
      createDeck(() => 0.5);
    });
  } finally {
    Math.random = originalRandom;
  }
});

test('initializeHand sets blinds and first actor for ring game', () => {
  const result = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 1000 },
      { id: 'p2', seatIndex: 2, stack: 1000 },
      { id: 'p3', seatIndex: 3, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(7)
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.sbSeat, 1);
  assert.equal(result.value.bbSeat, 2);
  assert.equal(result.value.currentActorSeat, 3);
  assert.equal(result.value.betting.currentBetToMatch, 20);
  assert.equal(result.value.betting.lastFullRaiseSize, 20);
  assert.equal(result.value.betting.lastAggressorId, 'p2');
  assert.deepEqual(result.value.actions, []);

  const seat1 = result.value.players.find((player) => player.seatIndex === 1);
  const seat2 = result.value.players.find((player) => player.seatIndex === 2);
  const seat3 = result.value.players.find((player) => player.seatIndex === 3);
  assert.equal(seat1?.stack, 990);
  assert.equal(seat1?.streetCommitted, 10);
  assert.equal(seat2?.stack, 980);
  assert.equal(seat2?.streetCommitted, 20);
  assert.equal(seat3?.stack, 1000);
  assert.equal(seat3?.streetCommitted, 0);
});

test('initializeHand uses heads-up blind positions (button posts small blind)', () => {
  const result = initializeHand({
    players: [
      { id: 'pA', seatIndex: 2, stack: 500 },
      { id: 'pB', seatIndex: 5, stack: 500 }
    ],
    buttonMarkerSeat: 2,
    smallBlind: 5,
    bigBlind: 10,
    rng: sequenceRng(11)
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.sbSeat, 2);
  assert.equal(result.value.bbSeat, 5);
  assert.equal(result.value.currentActorSeat, 2);
});

test('initializeHand returns error when active players are fewer than two', () => {
  const result = initializeHand({
    players: [{ id: 'solo', seatIndex: 4, stack: 100 }],
    buttonMarkerSeat: 4,
    smallBlind: 5,
    bigBlind: 10,
    rng: sequenceRng(1)
  });

  assert.deepEqual(result, {
    ok: false,
    error: 'not_enough_players'
  });
});

test('initializeHand deals two hole cards per player and removes them from deck', () => {
  const result = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 1000 },
      { id: 'p2', seatIndex: 2, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(12)
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const dealtCards = result.value.players.flatMap((player) => player.holeCards);
  assert.equal(dealtCards.length, 6);
  assert.equal(new Set(dealtCards).size, 6);
  for (const player of result.value.players) {
    assert.equal(player.holeCards.length, 2);
  }
  assert.equal(result.value.deck.length, 46);
});

test('getValidActions returns call and raise options for first preflop actor', () => {
  const result = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 1000 },
      { id: 'p2', seatIndex: 2, stack: 1000 },
      { id: 'p3', seatIndex: 3, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(99)
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const valid = getValidActions(result.value, 'p3');

  assert.deepEqual(valid, {
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 20,
    canRaise: true,
    minRaiseTo: 40,
    maxRaiseTo: 1000,
    canAllIn: true
  });
});

test('applyAction raise_to resets pending actors to everyone except raiser', () => {
  const initialized = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 1000 },
      { id: 'p2', seatIndex: 2, stack: 1000 },
      { id: 'p3', seatIndex: 3, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(100)
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const next = applyAction(initialized.value, {
    playerId: 'p3',
    type: 'raise_to',
    amount: 60
  });

  assert.equal(next.ok, true);
  if (!next.ok) return;

  assert.equal(next.value.currentActorSeat, 0);
  assert.deepEqual(next.value.pendingActorIds.sort(), ['p0', 'p1', 'p2']);
  assert.equal(next.value.betting.currentBetToMatch, 60);
  assert.equal(next.value.betting.lastFullRaiseSize, 40);
  assert.deepEqual(next.value.actions, [
    {
      playerId: 'p3',
      type: 'raise_to',
      amount: 60,
      addedAmount: 60,
      toAmount: 60,
      phase: 'betting_preflop',
      stackBefore: 1000,
      potTotalBefore: 30,
      timestamp: 0
    }
  ]);
});

test('short all-in does not re-open betting for a player who already acted', () => {
  const initialized = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 250 },
      { id: 'p2', seatIndex: 2, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    rng: sequenceRng(101)
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const a = applyAction(initialized.value, {
    playerId: 'p0',
    type: 'raise_to',
    amount: 200
  });
  assert.equal(a.ok, true);
  if (!a.ok) return;

  const b = applyAction(a.value, {
    playerId: 'p1',
    type: 'all_in'
  });
  assert.equal(b.ok, true);
  if (!b.ok) return;

  const c = applyAction(b.value, {
    playerId: 'p2',
    type: 'call'
  });
  assert.equal(c.ok, true);
  if (!c.ok) return;

  const validForP0 = getValidActions(c.value, 'p0');
  assert.equal(validForP0.canRaise, false);
  assert.equal(validForP0.canCall, true);
  assert.equal(validForP0.callAmount, 50);
});

test('multiple short all-ins can cumulatively re-open betting', () => {
  const initialized = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 250 },
      { id: 'p1', seatIndex: 1, stack: 300 },
      { id: 'p2', seatIndex: 2, stack: 1200 },
      { id: 'p3', seatIndex: 3, stack: 1200 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    rng: sequenceRng(102)
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const a = applyAction(initialized.value, {
    playerId: 'p3',
    type: 'raise_to',
    amount: 200
  });
  assert.equal(a.ok, true);
  if (!a.ok) return;

  const b = applyAction(a.value, {
    playerId: 'p0',
    type: 'all_in'
  });
  assert.equal(b.ok, true);
  if (!b.ok) return;

  const c = applyAction(b.value, {
    playerId: 'p1',
    type: 'all_in'
  });
  assert.equal(c.ok, true);
  if (!c.ok) return;

  const d = applyAction(c.value, {
    playerId: 'p2',
    type: 'call'
  });
  assert.equal(d.ok, true);
  if (!d.ok) return;

  const validForP3 = getValidActions(d.value, 'p3');
  assert.equal(validForP3.canRaise, true);
  assert.equal(validForP3.callAmount, 100);
  assert.equal(validForP3.minRaiseTo, 400);
});

test('preflop completion deals flop and resets street betting state', () => {
  const initialized = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 1000 },
      { id: 'p2', seatIndex: 2, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(103)
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const a = applyAction(initialized.value, { playerId: 'p0', type: 'call' });
  assert.equal(a.ok, true);
  if (!a.ok) return;

  const b = applyAction(a.value, { playerId: 'p1', type: 'call' });
  assert.equal(b.ok, true);
  if (!b.ok) return;

  const c = applyAction(b.value, { playerId: 'p2', type: 'check' });
  assert.equal(c.ok, true);
  if (!c.ok) return;

  assert.equal(c.value.phase, 'betting_flop');
  assert.equal(c.value.communityCards.length, 3);
  assert.equal(c.value.currentActorSeat, 1);
  assert.equal(c.value.betting.currentBetToMatch, 0);
  assert.equal(c.value.betting.lastFullRaiseSize, 20);
  assert.equal(c.value.betting.lastAggressorId, null);

  for (const player of c.value.players) {
    if (player.status !== 'folded') {
      assert.equal(player.streetCommitted, 0);
      assert.equal(player.hasActedThisStreet, false);
      assert.equal(player.matchedBetToMatchAtLastAction, 0);
    }
  }
});

test('street progression deals turn and river then ends hand after river betting', () => {
  const initialized = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 1000 },
      { id: 'p2', seatIndex: 2, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(104)
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const p0Call = applyAction(initialized.value, { playerId: 'p0', type: 'call' });
  assert.equal(p0Call.ok, true);
  if (!p0Call.ok) return;
  const p1Call = applyAction(p0Call.value, { playerId: 'p1', type: 'call' });
  assert.equal(p1Call.ok, true);
  if (!p1Call.ok) return;
  const p2Check = applyAction(p1Call.value, { playerId: 'p2', type: 'check' });
  assert.equal(p2Check.ok, true);
  if (!p2Check.ok) return;
  assert.equal(p2Check.value.phase, 'betting_flop');

  const flopP1Check = applyAction(p2Check.value, { playerId: 'p1', type: 'check' });
  assert.equal(flopP1Check.ok, true);
  if (!flopP1Check.ok) return;
  const flopP2Check = applyAction(flopP1Check.value, { playerId: 'p2', type: 'check' });
  assert.equal(flopP2Check.ok, true);
  if (!flopP2Check.ok) return;
  const flopP0Check = applyAction(flopP2Check.value, { playerId: 'p0', type: 'check' });
  assert.equal(flopP0Check.ok, true);
  if (!flopP0Check.ok) return;
  assert.equal(flopP0Check.value.phase, 'betting_turn');
  assert.equal(flopP0Check.value.communityCards.length, 4);

  const turnP1Check = applyAction(flopP0Check.value, { playerId: 'p1', type: 'check' });
  assert.equal(turnP1Check.ok, true);
  if (!turnP1Check.ok) return;
  const turnP2Check = applyAction(turnP1Check.value, { playerId: 'p2', type: 'check' });
  assert.equal(turnP2Check.ok, true);
  if (!turnP2Check.ok) return;
  const turnP0Check = applyAction(turnP2Check.value, { playerId: 'p0', type: 'check' });
  assert.equal(turnP0Check.ok, true);
  if (!turnP0Check.ok) return;
  assert.equal(turnP0Check.value.phase, 'betting_river');
  assert.equal(turnP0Check.value.communityCards.length, 5);

  const riverP1Check = applyAction(turnP0Check.value, { playerId: 'p1', type: 'check' });
  assert.equal(riverP1Check.ok, true);
  if (!riverP1Check.ok) return;
  const riverP2Check = applyAction(riverP1Check.value, { playerId: 'p2', type: 'check' });
  assert.equal(riverP2Check.ok, true);
  if (!riverP2Check.ok) return;
  const riverP0Check = applyAction(riverP2Check.value, { playerId: 'p0', type: 'check' });
  assert.equal(riverP0Check.ok, true);
  if (!riverP0Check.ok) return;
  assert.equal(riverP0Check.value.phase, 'hand_end');
  assert.equal(riverP0Check.value.currentActorSeat, null);
  assert.deepEqual(riverP0Check.value.pots, [
    {
      amount: 60,
      eligiblePlayerIds: ['p0', 'p1', 'p2']
    }
  ]);
  const totalPayout = riverP0Check.value.payouts.reduce((sum, payout) => sum + payout.amount, 0);
  assert.equal(totalPayout, 60);
  assert.equal(riverP0Check.value.payouts.length > 0, true);
  const totalStacks = riverP0Check.value.players.reduce((sum, player) => sum + player.stack, 0);
  assert.equal(totalStacks, 3000);
});

test('preflop all-in runout deals remaining board and reaches hand_end', () => {
  const initialized = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 100 },
      { id: 'p1', seatIndex: 1, stack: 100 },
      { id: 'p2', seatIndex: 2, stack: 100 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(106)
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const p0AllIn = applyAction(initialized.value, { playerId: 'p0', type: 'all_in' });
  assert.equal(p0AllIn.ok, true);
  if (!p0AllIn.ok) return;

  const p1AllIn = applyAction(p0AllIn.value, { playerId: 'p1', type: 'all_in' });
  assert.equal(p1AllIn.ok, true);
  if (!p1AllIn.ok) return;

  const p2AllIn = applyAction(p1AllIn.value, { playerId: 'p2', type: 'all_in' });
  assert.equal(p2AllIn.ok, true);
  if (!p2AllIn.ok) return;

  assert.equal(p2AllIn.value.phase, 'hand_end');
  assert.equal(p2AllIn.value.currentActorSeat, null);
  assert.deepEqual(p2AllIn.value.pendingActorIds, []);
  assert.equal(p2AllIn.value.communityCards.length, 5);
  assert.deepEqual(p2AllIn.value.pots, [
    {
      amount: 300,
      eligiblePlayerIds: ['p0', 'p1', 'p2']
    }
  ]);
  const totalPayout = p2AllIn.value.payouts.reduce((sum, payout) => sum + payout.amount, 0);
  assert.equal(totalPayout, 300);
  const totalStacks = p2AllIn.value.players.reduce((sum, player) => sum + player.stack, 0);
  assert.equal(totalStacks, 300);
});

test('all_in action log records both added and total committed amounts consistently', () => {
  const shortAllInState = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 150 },
      { id: 'p2', seatIndex: 2, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    rng: sequenceRng(107)
  });

  assert.equal(shortAllInState.ok, true);
  if (!shortAllInState.ok) return;

  const opened = applyAction(
    shortAllInState.value,
    { playerId: 'p0', type: 'raise_to', amount: 200 },
    1_000
  );
  assert.equal(opened.ok, true);
  if (!opened.ok) return;

  const shortAllIn = applyAction(
    opened.value,
    { playerId: 'p1', type: 'all_in' },
    1_001
  );
  assert.equal(shortAllIn.ok, true);
  if (!shortAllIn.ok) return;

  assert.deepEqual(shortAllIn.value.actions.at(-1), {
    playerId: 'p1',
    type: 'all_in',
    amount: 150,
    addedAmount: 100,
    toAmount: 150,
    phase: 'betting_preflop',
    stackBefore: 100,
    potTotalBefore: 350,
    timestamp: 1_001
  });

  const raiseAllInState = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 250 },
      { id: 'p2', seatIndex: 2, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    rng: sequenceRng(108)
  });

  assert.equal(raiseAllInState.ok, true);
  if (!raiseAllInState.ok) return;

  const reopened = applyAction(
    raiseAllInState.value,
    { playerId: 'p0', type: 'raise_to', amount: 200 },
    2_000
  );
  assert.equal(reopened.ok, true);
  if (!reopened.ok) return;

  const raiseAllIn = applyAction(
    reopened.value,
    { playerId: 'p1', type: 'all_in' },
    2_001
  );
  assert.equal(raiseAllIn.ok, true);
  if (!raiseAllIn.ok) return;

  assert.deepEqual(raiseAllIn.value.actions.at(-1), {
    playerId: 'p1',
    type: 'all_in',
    amount: 250,
    addedAmount: 200,
    toAmount: 250,
    phase: 'betting_preflop',
    stackBefore: 200,
    potTotalBefore: 350,
    timestamp: 2_001
  });
});

function committedPlayer(
  id: string,
  seatIndex: number,
  handCommitted: number,
  status: 'active' | 'folded' | 'all_in'
) {
  return {
    id,
    seatIndex,
    stack: 0,
    streetCommitted: 0,
    handCommitted,
    status,
    holeCards: [],
    hasActedThisStreet: false,
    matchedBetToMatchAtLastAction: 0
  };
}

function showdownCommittedPlayer(
  id: string,
  seatIndex: number,
  handCommitted: number,
  holeCards: [string, string]
) {
  return {
    ...committedPlayer(id, seatIndex, handCommitted, 'active'),
    holeCards: [...holeCards]
  };
}

test('buildSidePots returns single main pot when all commitments are equal', () => {
  const pots = buildSidePots([
    committedPlayer('a', 0, 100, 'active'),
    committedPlayer('b', 1, 100, 'active'),
    committedPlayer('c', 2, 100, 'active')
  ]);

  assert.deepEqual(pots, [
    {
      amount: 300,
      eligiblePlayerIds: ['a', 'b', 'c']
    }
  ]);
});

test('buildSidePots includes folded contributions and merges equal-eligible side layers', () => {
  const pots = buildSidePots([
    committedPlayer('a', 0, 100, 'all_in'),
    committedPlayer('b', 1, 300, 'all_in'),
    committedPlayer('c', 2, 500, 'active'),
    committedPlayer('d', 3, 200, 'folded')
  ]);

  assert.deepEqual(pots, [
    {
      amount: 400,
      eligiblePlayerIds: ['a', 'b', 'c']
    },
    {
      amount: 500,
      eligiblePlayerIds: ['b', 'c']
    },
    {
      amount: 200,
      eligiblePlayerIds: ['c']
    }
  ]);
});

test('settleShowdownPots awards contested pot to best five-card hand', () => {
  const players = [
    showdownCommittedPlayer('a', 0, 100, ['Ad', 'Ac']),
    showdownCommittedPlayer('b', 1, 100, ['Kc', 'Kh'])
  ];
  const payouts = settleShowdownPots(
    players,
    [{ amount: 200, eligiblePlayerIds: ['a', 'b'] }],
    ['As', 'Kd', 'Qc', '7h', '2d'],
    1
  );

  assert.deepEqual(payouts, [
    {
      potIndex: 0,
      playerId: 'a',
      amount: 200
    }
  ]);
  const a = players.find((player) => player.id === 'a');
  const b = players.find((player) => player.id === 'b');
  assert.equal(a?.stack, 200);
  assert.equal(b?.stack, 0);
});

test('settleShowdownPots splits tied pot and gives odd chip to first winner left of button', () => {
  const players = [
    showdownCommittedPlayer('a', 0, 100, ['2c', '3d']),
    showdownCommittedPlayer('b', 2, 100, ['4c', '5d'])
  ];
  const payouts = settleShowdownPots(
    players,
    [{ amount: 101, eligiblePlayerIds: ['a', 'b'] }],
    ['Ah', 'Kd', 'Qc', 'Js', 'Tc'],
    1
  );

  const aPayout = payouts.find((payout) => payout.playerId === 'a');
  const bPayout = payouts.find((payout) => payout.playerId === 'b');
  assert.equal(aPayout?.amount, 50);
  assert.equal(bPayout?.amount, 51);
  const a = players.find((player) => player.id === 'a');
  const b = players.find((player) => player.id === 'b');
  assert.equal(a?.stack, 50);
  assert.equal(b?.stack, 51);
});

test('evaluateBestSevenCards returns ranking and best five-card combo', () => {
  const evaluated = evaluateBestSevenCards([
    'Ah', 'Kh', 'Qh', 'Jh', 'Th', '2c', '3d'
  ]);

  assert.deepEqual(evaluated.rank, [8, 14]);
  assert.deepEqual(evaluated.bestCards, ['Ah', 'Kh', 'Qh', 'Jh', 'Th']);
});

test('hand_end builds pot with folded contributions and surviving eligible player', () => {
  const initialized = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 1000 },
      { id: 'p2', seatIndex: 2, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(105)
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const raise = applyAction(initialized.value, { playerId: 'p0', type: 'raise_to', amount: 60 });
  assert.equal(raise.ok, true);
  if (!raise.ok) return;

  const fold1 = applyAction(raise.value, { playerId: 'p1', type: 'fold' });
  assert.equal(fold1.ok, true);
  if (!fold1.ok) return;

  const fold2 = applyAction(fold1.value, { playerId: 'p2', type: 'fold' });
  assert.equal(fold2.ok, true);
  if (!fold2.ok) return;

  assert.equal(fold2.value.phase, 'hand_end');
  // p0's raise was only called up to the big blind (20); the uncalled 40 goes back to p0 and is not a pot.
  assert.deepEqual(fold2.value.pots, [
    {
      amount: 50,
      eligiblePlayerIds: ['p0']
    }
  ]);
  assert.deepEqual(fold2.value.payouts, [
    {
      potIndex: 0,
      playerId: 'p0',
      amount: 50
    }
  ]);

  const p0 = fold2.value.players.find((player) => player.id === 'p0');
  const p1 = fold2.value.players.find((player) => player.id === 'p1');
  const p2 = fold2.value.players.find((player) => player.id === 'p2');
  assert.equal(p0?.stack, 1030);
  assert.equal(p1?.stack, 990);
  assert.equal(p2?.stack, 980);
});

type TestHandState = Extract<ReturnType<typeof initializeHand>, { ok: true }>['value'];

function startHand(
  stacks: number[],
  options: { buttonMarkerSeat?: number; smallBlind?: number; bigBlind?: number; seed?: number } = {},
): TestHandState {
  const result = initializeHand({
    players: stacks.map((stack, index) => ({ id: `p${index}`, seatIndex: index, stack })),
    buttonMarkerSeat: options.buttonMarkerSeat ?? 0,
    smallBlind: options.smallBlind ?? 50,
    bigBlind: options.bigBlind ?? 100,
    rng: sequenceRng(options.seed ?? 1),
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('initializeHand failed');
  return result.value;
}

function act(
  state: TestHandState,
  playerId: string,
  type: Parameters<typeof applyActionBase>[1]['type'],
  amount?: number,
): TestHandState {
  const result = applyAction(state, { playerId, type, amount });
  assert.equal(result.ok, true, `${playerId} ${type} should be legal`);
  if (!result.ok) throw new Error('applyAction failed');
  return result.value;
}

function assertChipsConserved(state: TestHandState, initialTotal: number): void {
  const committed = state.players.reduce((sum, player) => sum + player.handCommitted, 0);
  const paid = state.payouts.reduce((sum, payout) => sum + payout.amount, 0);
  const stacks = state.players.reduce((sum, player) => sum + player.stack, 0);
  assert.equal(paid, committed);
  assert.equal(stacks, initialTotal);
}

test('incomplete all-in raise does not reopen betting: raise_to and over-call all_in are rejected', () => {
  let state = startHand([1000, 250, 1000]);
  state = act(state, 'p0', 'raise_to', 200);
  state = act(state, 'p1', 'all_in');
  state = act(state, 'p2', 'call');

  assert.equal(state.currentActorSeat, 0);
  const valid = getValidActions(state, 'p0');
  assert.equal(valid.canRaise, false);
  assert.equal(valid.canCall, true);
  assert.equal(valid.canAllIn, false);

  assert.deepEqual(applyAction(state, { playerId: 'p0', type: 'raise_to', amount: 400 }), {
    ok: false,
    error: 'invalid_action',
  });
  assert.deepEqual(applyAction(state, { playerId: 'p0', type: 'all_in' }), {
    ok: false,
    error: 'invalid_action',
  });
  assert.equal(applyAction(state, { playerId: 'p0', type: 'call' }).ok, true);
  assert.equal(applyAction(state, { playerId: 'p0', type: 'fold' }).ok, true);
});

test('all_in at or below the call amount stays legal when the raise is not reopened', () => {
  let state = startHand([240, 250, 1000]);
  state = act(state, 'p0', 'raise_to', 200);
  state = act(state, 'p1', 'all_in');
  state = act(state, 'p2', 'call');

  const valid = getValidActions(state, 'p0');
  assert.equal(valid.canRaise, false);
  assert.equal(valid.canAllIn, true);

  const finished = act(state, 'p0', 'all_in');
  assert.equal(finished.phase, 'hand_end');
  assertChipsConserved(finished, 1490);
});

test('initializeHand runs out the board when nobody can act after blinds', () => {
  const state = startHand([40, 80]);

  assert.equal(state.phase, 'hand_end');
  assert.equal(state.currentActorSeat, null);
  assert.equal(state.communityCards.length, 5);
  assertChipsConserved(state, 120);
});

test('initializeHand runs out the board when the only active player has nothing to call', () => {
  const state = startHand([1000, 30], { buttonMarkerSeat: 1 });

  assert.equal(state.phase, 'hand_end');
  assert.equal(state.communityCards.length, 5);
  assertChipsConserved(state, 1030);
});

test('lone actor facing an all-in call has nothing to respond to: board runs out to hand_end', () => {
  let state = startHand([1000, 300]);
  state = act(state, 'p0', 'raise_to', 300);
  state = act(state, 'p1', 'call');

  assert.equal(state.phase, 'hand_end');
  assert.equal(state.currentActorSeat, null);
  assert.equal(state.communityCards.length, 5);
  assertChipsConserved(state, 1300);
});

test('lone actor who over-bet a short all-in call gets the excess back at hand_end', () => {
  let state = startHand([1000, 300]);
  state = act(state, 'p0', 'raise_to', 500);
  state = act(state, 'p1', 'call');

  assert.equal(state.phase, 'hand_end');
  // The uncalled 200 is returned to p0 rather than paid out as a single-eligible pot.
  assert.deepEqual(state.pots.map((pot) => pot.amount), [600]);
  assert.equal(state.players.find((player) => player.id === 'p0')?.handCommitted, 300);
  assertChipsConserved(state, 1300);
});

test('street advance with a single active player vs all-in runs out the board', () => {
  let state = startHand([1000, 200, 1000]);
  state = act(state, 'p0', 'raise_to', 200);
  state = act(state, 'p1', 'call');
  state = act(state, 'p2', 'fold');

  assert.equal(state.phase, 'hand_end');
  assert.equal(state.communityCards.length, 5);
  assertChipsConserved(state, 2200);
});

test('lone actor who still faces a bet is asked to call or fold', () => {
  let state = startHand([1000, 200, 1000]);
  state = act(state, 'p0', 'fold');
  state = act(state, 'p1', 'all_in');

  assert.equal(state.phase, 'betting_preflop');
  assert.equal(state.currentActorSeat, 2);
  const valid = getValidActions(state, 'p2');
  assert.equal(valid.canCall, true);
  assert.equal(valid.callAmount, 100);

  const called = act(state, 'p2', 'call');
  assert.equal(called.phase, 'hand_end');
  assert.equal(called.communityCards.length, 5);
  assertChipsConserved(called, 2200);
});

test('short big blind still sets the full big blind as the bet to match', () => {
  const state = startHand([1000, 1000, 30]);

  assert.equal(state.betting.currentBetToMatch, 100);
  assert.equal(state.betting.lastFullRaiseSize, 100);
  const bb = state.players.find((player) => player.id === 'p2');
  assert.equal(bb?.status, 'all_in');
  assert.equal(bb?.handCommitted, 30);

  assert.equal(state.currentActorSeat, 0);
  const valid = getValidActions(state, 'p0');
  assert.equal(valid.callAmount, 100);
  assert.equal(valid.minRaiseTo, 200);
});

test('short big blind hand keeps chips conserved through side pots', () => {
  let state = startHand([1000, 1000, 30]);
  state = act(state, 'p0', 'call');
  state = act(state, 'p1', 'call');
  state = act(state, 'p1', 'check');
  state = act(state, 'p0', 'check');
  state = act(state, 'p1', 'check');
  state = act(state, 'p0', 'check');
  state = act(state, 'p1', 'check');
  state = act(state, 'p0', 'check');

  assert.equal(state.phase, 'hand_end');
  assert.equal(state.pots[0]?.amount, 90);
  assertChipsConserved(state, 2030);
});

test('initializeHand rejects more players than the deck can deal', () => {
  const makePlayers = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ id: `p${index}`, seatIndex: index, stack: 1000 }));

  const tooMany = initializeHand({
    players: makePlayers(24),
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(5),
  });
  assert.deepEqual(tooMany, { ok: false, error: 'too_many_players' });

  const maxPlayers = initializeHand({
    players: makePlayers(23),
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(5),
  });
  assert.equal(maxPlayers.ok, true);
  if (!maxPlayers.ok) return;
  for (const player of maxPlayers.value.players) {
    assert.equal(player.holeCards.length, 2);
  }
});

test('evaluateBestSevenCards ranks wheel straight and 6-high straight; 6-high wins showdown', () => {
  const wheel = evaluateBestSevenCards(['Ad', '2h', '3c', '4d', '5s', '9h', 'Kc']);
  const sixHigh = evaluateBestSevenCards(['2c', '6d', '3c', '4d', '5s', '9h', 'Kc']);
  assert.deepEqual(wheel.rank, [4, 5]);
  assert.deepEqual(sixHigh.rank, [4, 6]);

  const players = [
    showdownCommittedPlayer('a', 0, 100, ['Ad', '2h']),
    showdownCommittedPlayer('b', 1, 100, ['2c', '6d']),
  ];
  const payouts = settleShowdownPots(
    players,
    [{ amount: 200, eligiblePlayerIds: ['a', 'b'] }],
    ['3c', '4d', '5s', '9h', 'Kc'],
    1,
  );
  assert.deepEqual(payouts, [{ potIndex: 0, playerId: 'b', amount: 200 }]);
});

test('wheel straight flush ranks as five-high and loses to a six-high straight flush', () => {
  const wheelFlush = evaluateBestSevenCards(['As', 'Kd', '2s', '3s', '4s', '5s', '9h']);
  assert.deepEqual(wheelFlush.rank, [8, 5]);
  assert.deepEqual(wheelFlush.bestCards.slice().sort(), ['2s', '3s', '4s', '5s', 'As']);

  const players = [
    showdownCommittedPlayer('a', 0, 100, ['As', 'Kd']),
    showdownCommittedPlayer('b', 1, 100, ['6s', 'Kc']),
  ];
  const payouts = settleShowdownPots(
    players,
    [{ amount: 200, eligiblePlayerIds: ['a', 'b'] }],
    ['2s', '3s', '4s', '5s', '9h'],
    0,
  );
  assert.deepEqual(payouts, [{ potIndex: 0, playerId: 'b', amount: 200 }]);
});

test('flush beats straight at showdown', () => {
  const board = ['4h', '5h', '9h', 'Kd', '8c'] as const;
  const flush = evaluateBestSevenCards(['Ah', '2h', ...board]);
  const straight = evaluateBestSevenCards(['6c', '7d', ...board]);
  assert.equal(flush.rank[0], 5);
  assert.deepEqual(straight.rank, [4, 9]);

  const players = [
    showdownCommittedPlayer('a', 0, 100, ['6c', '7d']),
    showdownCommittedPlayer('b', 1, 100, ['Ah', '2h']),
  ];
  const payouts = settleShowdownPots(
    players,
    [{ amount: 200, eligiblePlayerIds: ['a', 'b'] }],
    [...board],
    0,
  );
  assert.deepEqual(payouts, [{ potIndex: 0, playerId: 'b', amount: 200 }]);
});

test('two pair kicker decides the pot when both play the same two pair', () => {
  const players = [
    showdownCommittedPlayer('a', 0, 100, ['Qc', 'Jd']),
    showdownCommittedPlayer('b', 1, 100, ['Ac', '3d']),
  ];
  const payouts = settleShowdownPots(
    players,
    [{ amount: 200, eligiblePlayerIds: ['a', 'b'] }],
    ['Ks', 'Kd', '7c', '7h', '2d'],
    0,
  );
  assert.deepEqual(payouts, [{ potIndex: 0, playerId: 'b', amount: 200 }]);
});

test('board plays: royal flush on board splits the pot evenly', () => {
  const players = [
    showdownCommittedPlayer('a', 0, 100, ['2c', '3d']),
    showdownCommittedPlayer('b', 1, 100, ['4c', '5d']),
  ];
  const payouts = settleShowdownPots(
    players,
    [{ amount: 200, eligiblePlayerIds: ['a', 'b'] }],
    ['As', 'Ks', 'Qs', 'Js', 'Ts'],
    0,
  );
  assert.deepEqual(payouts, [
    { potIndex: 0, playerId: 'b', amount: 100 },
    { potIndex: 0, playerId: 'a', amount: 100 },
  ]);
});

test('three-way split gives odd chips to the first winners left of the button', () => {
  const players = [
    showdownCommittedPlayer('a', 0, 100, ['2c', '3d']),
    showdownCommittedPlayer('b', 1, 100, ['4c', '5d']),
    showdownCommittedPlayer('c', 2, 100, ['6c', '7d']),
  ];
  const payouts = settleShowdownPots(
    players,
    [{ amount: 101, eligiblePlayerIds: ['a', 'b', 'c'] }],
    ['As', 'Ks', 'Qs', 'Js', 'Ts'],
    1,
  );

  assert.deepEqual(payouts, [
    { potIndex: 0, playerId: 'c', amount: 34 },
    { potIndex: 0, playerId: 'a', amount: 34 },
    { potIndex: 0, playerId: 'b', amount: 33 },
  ]);
  assert.equal(payouts.reduce((sum, payout) => sum + payout.amount, 0), 101);
});

test('three-way side pot with one short all-in pays each pot to its best eligible hand', () => {
  const players = [
    { ...showdownCommittedPlayer('a', 0, 100, ['Ac', 'Ad']), status: 'all_in' as const },
    showdownCommittedPlayer('b', 1, 300, ['Kc', 'Kd']),
    showdownCommittedPlayer('c', 2, 300, ['Qc', 'Qd']),
  ];
  const pots = buildSidePots(players);
  assert.deepEqual(pots, [
    { amount: 300, eligiblePlayerIds: ['a', 'b', 'c'] },
    { amount: 400, eligiblePlayerIds: ['b', 'c'] },
  ]);

  const payouts = settleShowdownPots(players, pots, ['2s', '5d', '8c', '9h', 'Jd'], 0);
  assert.deepEqual(payouts, [
    { potIndex: 0, playerId: 'a', amount: 300 },
    { potIndex: 1, playerId: 'b', amount: 400 },
  ]);
  const stacks = players.reduce((sum, player) => sum + player.stack, 0);
  assert.equal(stacks, 700);
});

test('hand_end returns an uncalled all-in excess instead of paying it out as a pot', () => {
  const initialized = initializeHand({
    players: [
      { id: 'big', seatIndex: 0, stack: 1000 },
      { id: 'short', seatIndex: 1, stack: 300 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(42)
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const shove = applyAction(initialized.value, { playerId: 'big', type: 'all_in' });
  assert.equal(shove.ok, true);
  if (!shove.ok) return;

  const call = applyAction(shove.value, { playerId: 'short', type: 'call' });
  assert.equal(call.ok, true);
  if (!call.ok) return;

  const end = call.value;
  assert.equal(end.phase, 'hand_end');
  assert.deepEqual(end.pots, [{ amount: 600, eligiblePlayerIds: ['big', 'short'] }]);
  assert.equal(end.potTotal, 600);
  assert.ok(end.payouts.every((payout) => payout.amount === 600), 'only the contested 600 is paid out');

  const big = end.players.find((player) => player.id === 'big');
  const short = end.players.find((player) => player.id === 'short');
  assert.equal(big?.handCommitted, 300);
  assert.equal((big?.stack ?? 0) + (short?.stack ?? 0), 1300);
  assert.ok((big?.stack ?? 0) >= 700, 'the uncalled 700 is back in the big stack');
});

test('an action that closes the street logs the totals it made, not the next street reset', () => {
  const initialized = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 1000 },
      { id: 'p2', seatIndex: 2, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(103)
  });
  assert.ok(initialized.ok);

  const raised = applyAction(initialized.value, { playerId: 'p0', type: 'raise_to', amount: 60 });
  assert.ok(raised.ok);
  const folded = applyAction(raised.value, { playerId: 'p1', type: 'fold' });
  assert.ok(folded.ok);
  const called = applyAction(folded.value, { playerId: 'p2', type: 'call' });
  assert.ok(called.ok);
  assert.equal(called.value.phase, 'betting_flop');
  assert.deepEqual(called.value.actions.at(-1), {
    playerId: 'p2',
    type: 'call',
    amount: 40,
    addedAmount: 40,
    toAmount: 60,
    phase: 'betting_preflop',
    stackBefore: 980,
    potTotalBefore: 90,
    timestamp: 0
  });

  const checked = applyAction(called.value, { playerId: 'p2', type: 'check' });
  assert.ok(checked.ok);
  const closed = applyAction(checked.value, { playerId: 'p0', type: 'check' });
  assert.ok(closed.ok);
  assert.equal(closed.value.phase, 'betting_turn');
  assert.equal(closed.value.actions.at(-1)?.toAmount, 0);
});

test('an action that ends the hand logs what was put in, before the uncalled part goes back', () => {
  const initialized = initializeHand({
    players: [
      { id: 'big', seatIndex: 0, stack: 1000 },
      { id: 'short', seatIndex: 1, stack: 300 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(42)
  });
  assert.ok(initialized.ok);

  // The short stack calls all-in for less and ends the hand.
  const shove = applyAction(initialized.value, { playerId: 'big', type: 'all_in' });
  assert.ok(shove.ok);
  const call = applyAction(shove.value, { playerId: 'short', type: 'call' });
  assert.ok(call.ok);
  assert.equal(call.value.phase, 'hand_end');
  assert.deepEqual(
    call.value.actions.map(({ playerId, type, amount, addedAmount, toAmount }) => ({ playerId, type, amount, addedAmount, toAmount })),
    [
      { playerId: 'big', type: 'all_in', amount: 1000, addedAmount: 990, toAmount: 1000 },
      { playerId: 'short', type: 'call', amount: 280, addedAmount: 280, toAmount: 300 }
    ]
  );

  // The big stack's all-in over a short all-in ends the hand; the log keeps the full shove.
  const shortShove = applyAction(initialized.value, { playerId: 'big', type: 'call' });
  assert.ok(shortShove.ok);
  const jam = applyAction(shortShove.value, { playerId: 'short', type: 'all_in' });
  assert.ok(jam.ok);
  const overJam = applyAction(jam.value, { playerId: 'big', type: 'all_in' });
  assert.ok(overJam.ok);
  assert.equal(overJam.value.phase, 'hand_end');
  const { type, amount, addedAmount, toAmount } = overJam.value.actions.at(-1)!;
  assert.deepEqual({ type, amount, addedAmount, toAmount }, { type: 'all_in', amount: 1000, addedAmount: 980, toAmount: 1000 });
});
