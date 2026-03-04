import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAction, buildSidePots, createDeck, getValidActions, initializeHand } from './index.ts';

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
  assert.deepEqual(riverP0Check.value.payouts, []);
  for (const player of riverP0Check.value.players) {
    assert.equal(player.stack, 980);
  }
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
  assert.deepEqual(p2AllIn.value.payouts, []);
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
  assert.deepEqual(fold2.value.pots, [
    {
      amount: 90,
      eligiblePlayerIds: ['p0']
    }
  ]);
  assert.deepEqual(fold2.value.payouts, [
    {
      potIndex: 0,
      playerId: 'p0',
      amount: 90
    }
  ]);

  const p0 = fold2.value.players.find((player) => player.id === 'p0');
  const p1 = fold2.value.players.find((player) => player.id === 'p1');
  const p2 = fold2.value.players.find((player) => player.id === 'p2');
  assert.equal(p0?.stack, 1030);
  assert.equal(p1?.stack, 990);
  assert.equal(p2?.stack, 980);
});
