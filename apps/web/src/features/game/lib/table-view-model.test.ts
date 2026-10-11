import assert from 'node:assert/strict';
import test from 'node:test';

import type { GameAction, HandState, PlayerState } from '@aipoker/shared';

import {
  buildTableViewModel,
  toBotPersonality,
  getLastActionsForStreet,
  getVisibleHoleCards,
  shareTableViewModel,
  toSeatLastAction,
  type OccupiedSeatViewModel,
  type TableViewModel,
  type TableViewModelInput,
} from './table-view-model.ts';
import { getSeatLayouts } from './seat-layout.ts';

function makePlayer(overrides: Partial<PlayerState> & Pick<PlayerState, 'id' | 'seatIndex'>): PlayerState {
  return {
    name: overrides.id,
    stack: 1000,
    streetCommitted: 0,
    handCommitted: 0,
    status: 'active',
    holeCards: [],
    isBot: true,
    hasActedThisStreet: false,
    matchedBetToMatchAtLastAction: 0,
    ...overrides,
  };
}

function makeAction(overrides: Partial<GameAction> & Pick<GameAction, 'playerId' | 'type' | 'sequenceNum'>): GameAction {
  return {
    playerName: overrides.playerId,
    seatIndex: 0,
    phase: 'betting_preflop',
    amount: 0,
    addedAmount: 0,
    toAmount: 0,
    stackBefore: 1000,
    potTotalBefore: 0,
    timestamp: 0,
    ...overrides,
  };
}

function makeHand(overrides: Partial<HandState> = {}): HandState {
  return {
    id: 'room:7',
    roomId: 'room',
    handNumber: 7,
    phase: 'betting_flop',
    maxSeats: 6,
    smallBlind: 10,
    bigBlind: 20,
    buttonMarkerSeat: 1,
    sbSeat: 2,
    bbSeat: 3,
    players: [
      makePlayer({ id: 'hero', seatIndex: 2, isBot: false, holeCards: ['As', 'Kd'], streetCommitted: 40, handCommitted: 60 }),
      makePlayer({ id: 'bot1', seatIndex: 1, handCommitted: 20, status: 'folded' }),
      makePlayer({ id: 'bot3', seatIndex: 3, streetCommitted: 40, handCommitted: 60 }),
      makePlayer({ id: 'bot5', seatIndex: 5, handCommitted: 20 }),
    ],
    communityCards: ['2c', '7h', 'Td'],
    pots: [{ amount: 80, eligiblePlayerIds: ['hero', 'bot3', 'bot5'] }],
    betting: { currentBetToMatch: 40, lastFullRaiseSize: 40, lastAggressorId: 'hero' },
    currentActorSeat: 3,
    actions: [
      makeAction({ playerId: 'bot1', type: 'fold', sequenceNum: 1, seatIndex: 1 }),
      makeAction({ playerId: 'bot3', type: 'call', sequenceNum: 2, seatIndex: 3, addedAmount: 10, toAmount: 20 }),
      makeAction({ playerId: 'hero', type: 'check', sequenceNum: 3, seatIndex: 2, phase: 'betting_flop' }),
      makeAction({ playerId: 'bot3', type: 'bet', sequenceNum: 4, seatIndex: 3, phase: 'betting_flop', amount: 20, toAmount: 20 }),
      makeAction({ playerId: 'hero', type: 'raise_to', sequenceNum: 5, seatIndex: 2, phase: 'betting_flop', toAmount: 40 }),
    ],
    ...overrides,
  };
}

function makeInput(overrides: Partial<TableViewModelInput> = {}): TableViewModelInput {
  return {
    hand: makeHand(),
    currentUserId: 'hero',
    timerStartedAt: null,
    timerDurationMs: 30000,
    winnerIds: [],
    winnerCards: [],
    winnerBestCardsByPlayer: {},
    payoutAmountsByPlayer: {},
    handResultPhase: undefined,
    isWinning: false,
    ...overrides,
  };
}

function occupied(vm: TableViewModel, seatIndex: number): OccupiedSeatViewModel {
  const seat = vm.seats[seatIndex];
  assert.ok(seat && seat.kind === 'player', `seat ${seatIndex} should be occupied`);
  return seat;
}

test('buildTableViewModel returns one seat per index with hero layout at bottom center', () => {
  const vm = buildTableViewModel(makeInput());
  assert.equal(vm.seats.length, 6);
  assert.deepEqual(vm.seats.map((seat) => seat.kind), ['empty', 'player', 'player', 'player', 'empty', 'player']);
  assert.equal(vm.heroSeatIndex, 2);
  assert.equal(vm.seats[2]!.layout, getSeatLayouts(6, 2)[2]);
  assert.equal(vm.seats[2]!.layout.seat.x, 50);
});

test('buildTableViewModel derives seat flags, bets, and current-street last actions', () => {
  const vm = buildTableViewModel(makeInput());
  const hero = occupied(vm, 2);
  const actor = occupied(vm, 3);
  const folded = occupied(vm, 1);

  assert.equal(hero.isHero, true);
  assert.equal(hero.isSB, true);
  assert.equal(actor.isBB, true);
  assert.equal(folded.isButton, true);
  assert.equal(actor.isActor, true);
  assert.equal(hero.streetCommitted, 40);
  assert.deepEqual(hero.lastAction, { kind: 'raise', label: 'raise 40', amount: 40 });
  assert.deepEqual(actor.lastAction, { kind: 'bet', label: 'bet 20', amount: 20 });
  // Preflop actions do not leak into the flop.
  assert.equal(folded.lastAction, null);
  assert.equal(folded.isDimmed, true);
  assert.equal(vm.street, 'flop');
  assert.equal(vm.buttonSeatIndex, 1);
});

test('hole cards: hero face-up, live opponents face-down, folded opponents hidden', () => {
  const vm = buildTableViewModel(makeInput());
  assert.deepEqual(occupied(vm, 2).holeCards, ['As', 'Kd']);
  assert.equal(occupied(vm, 2).showCards, true);
  assert.deepEqual(occupied(vm, 3).holeCards, [null, null]);
  assert.equal(occupied(vm, 3).showCards, false);
  assert.deepEqual(occupied(vm, 1).holeCards, []);
  assert.equal(occupied(vm, 2).handName, null, 'no hand names before showdown');
  assert.equal(occupied(vm, 2).handCategory, null);
});

test('getVisibleHoleCards reveals known cards only at showdown and keeps hero cards after folding', () => {
  assert.deepEqual(
    getVisibleHoleCards({ holeCards: ['Qs', 'Qh'], status: 'active', isHero: false, isShowdownReveal: true }),
    ['Qs', 'Qh'],
  );
  assert.deepEqual(
    getVisibleHoleCards({ holeCards: [], status: 'active', isHero: false, isShowdownReveal: true }),
    [],
  );
  assert.deepEqual(
    getVisibleHoleCards({ holeCards: ['Qs', 'Qh'], status: 'folded', isHero: true, isShowdownReveal: false }),
    ['Qs', 'Qh'],
  );
  assert.deepEqual(
    getVisibleHoleCards({ holeCards: ['Qs', 'Qh'], status: 'folded', isHero: false, isShowdownReveal: true }),
    [],
    'folded opponents stay mucked at showdown',
  );
});

test('timer is attached only to the acting human seat', () => {
  const botActing = buildTableViewModel(makeInput({ timerStartedAt: 1000 }));
  assert.equal(occupied(botActing, 3).timer, null);

  const heroActing = buildTableViewModel(
    makeInput({ hand: makeHand({ currentActorSeat: 2 }), timerStartedAt: 1000, timerDurationMs: 15000 }),
  );
  assert.deepEqual(occupied(heroActing, 2).timer, { startedAt: 1000, durationMs: 15000 });
});

test('pot total matches game-screen-state and side pots list every pot', () => {
  const vm = buildTableViewModel(makeInput());
  assert.equal(vm.pot.total, 160);
  assert.deepEqual(vm.pot.sidePots, []);

  const multi = buildTableViewModel(
    makeInput({
      hand: makeHand({
        pots: [
          { amount: 300, eligiblePlayerIds: ['hero', 'bot3'] },
          { amount: 120, eligiblePlayerIds: ['hero'] },
        ],
      }),
    }),
  );
  assert.equal(multi.pot.total, 420);
  assert.deepEqual(multi.pot.sidePots, [300, 120]);
});

test('winner data is gated on the result phase and drives highlight, payout, dimming', () => {
  const showdownHand = makeHand({
    phase: 'hand_end',
    currentActorSeat: null,
    players: [
      makePlayer({ id: 'hero', seatIndex: 2, isBot: false, holeCards: ['As', 'Kd'], stack: 1200 }),
      makePlayer({ id: 'bot3', seatIndex: 3, holeCards: ['Qc', 'Qd'], stack: 800 }),
    ],
  });
  const base = makeInput({
    hand: showdownHand,
    winnerIds: ['hero'],
    winnerCards: ['As', 'Kd', 'Td'],
    winnerBestCardsByPlayer: { hero: ['As', 'Kd', 'Td', '7h', '2c'] },
    payoutAmountsByPlayer: { hero: 200 },
    isWinning: true,
  });

  const revealing = buildTableViewModel({ ...base, handResultPhase: 'revealing' });
  assert.equal(occupied(revealing, 2).isWinner, false);
  assert.equal(occupied(revealing, 2).stack, 1000, 'payout held back while revealing');
  assert.deepEqual(occupied(revealing, 3).holeCards, ['Qc', 'Qd'], 'showdown cards revealed');
  assert.equal(occupied(revealing, 3).handName, 'Pair of Queens');
  assert.equal(occupied(revealing, 2).handName, 'Ace High');
  assert.equal(occupied(revealing, 3).handCategory, 'pair');
  assert.equal(occupied(revealing, 2).handCategory, 'highCard');
  assert.equal(occupied(buildTableViewModel({ ...base, handResultPhase: 'announcing' }), 3).handName, null);
  assert.deepEqual(revealing.board.winnerCards, []);
  assert.equal(revealing.pot.isAwarding, false);

  const showing = buildTableViewModel({ ...base, handResultPhase: 'showing' });
  const hero = occupied(showing, 2);
  assert.equal(hero.isWinner, true);
  assert.equal(hero.payout, 200);
  assert.equal(hero.stack, 1200);
  assert.deepEqual(hero.bestCards, ['As', 'Kd', 'Td', '7h', '2c']);
  assert.equal(occupied(showing, 3).isDimmed, true);
  assert.deepEqual(showing.board.winnerCards, ['As', 'Kd', 'Td']);
  assert.equal(showing.pot.isAwarding, true);
  assert.deepEqual(showing.pot.awardTargets, [{ playerId: 'hero', position: hero.layout.seat }]);
  assert.equal(occupied(showing, 2).lastAction, null, 'no action tags at hand end');
  assert.equal(
    occupied(buildTableViewModel({ ...base, hand: { ...showdownHand, players: showdownHand.players.map((p) => ({ ...p, streetCommitted: 20 })) } }), 2)
      .streetCommitted,
    0,
    'no bet bubbles at hand end',
  );
});

test('folds list every fold with hero cards revealed only for the hero', () => {
  const hand = makeHand({
    actions: [
      makeAction({ playerId: 'bot1', type: 'fold', sequenceNum: 1 }),
      makeAction({ playerId: 'hero', type: 'fold', sequenceNum: 2 }),
    ],
  });
  const vm = buildTableViewModel(makeInput({ hand }));
  assert.deepEqual(
    vm.folds.map((fold) => [fold.id, fold.cards, fold.faceDown]),
    [
      ['7-1-bot1', [], true],
      ['7-2-hero', ['As', 'Kd'], false],
    ],
  );
});

test('toSeatLastAction formats every action kind', () => {
  assert.equal(toSeatLastAction({ type: 'fold', amount: 0, addedAmount: 0, toAmount: 0 }).label, 'fold');
  assert.equal(toSeatLastAction({ type: 'call', amount: 40, addedAmount: 30, toAmount: 40 }).label, 'call 30');
  assert.equal(toSeatLastAction({ type: 'all_in', amount: 980, addedAmount: 900, toAmount: 980 }).kind, 'all_in');
  assert.equal(toSeatLastAction({ type: 'all_in', amount: 980, addedAmount: 900, toAmount: 980 }).label, 'all-in 980');
  assert.equal(getLastActionsForStreet(makeHand().actions, null).size, 0);
});

test('spectators see seat 0 at bottom and no hero', () => {
  const vm = buildTableViewModel(makeInput({ currentUserId: 'spectator' }));
  assert.equal(vm.heroSeatIndex, null);
  assert.equal(vm.seats[0]!.layout.seat.x, 50);
  assert.deepEqual(occupied(vm, 2).holeCards, [null, null]);
});

test('shareTableViewModel reuses unchanged references', () => {
  const first = buildTableViewModel(makeInput());
  const same = shareTableViewModel(first, buildTableViewModel(makeInput()));
  assert.equal(same, first);

  const changedHand = makeHand();
  changedHand.players = changedHand.players.map((player) =>
    player.id === 'bot5' ? { ...player, stack: 900 } : player,
  );
  const next = shareTableViewModel(first, buildTableViewModel(makeInput({ hand: changedHand })));
  assert.notEqual(next, first);
  assert.notEqual(next.seats, first.seats);
  assert.equal(next.seats[2], first.seats[2]);
  assert.notEqual(next.seats[5], first.seats[5]);
  assert.equal(next.board, first.board);
});

test('players who folded on an earlier street show no bet bubble', () => {
  const hand = makeHand({
    players: [
      makePlayer({ id: 'hero', seatIndex: 2, isBot: false, holeCards: ['As', 'Kd'] }),
      // Folded preflop; the engine leaves streetCommitted at 20 on the flop.
      makePlayer({ id: 'bot1', seatIndex: 1, status: 'folded', streetCommitted: 20 }),
      makePlayer({ id: 'bot3', seatIndex: 3, status: 'folded', streetCommitted: 40 }),
    ],
    actions: [
      makeAction({ playerId: 'bot1', type: 'fold', sequenceNum: 1, seatIndex: 1 }),
      makeAction({ playerId: 'bot3', type: 'fold', sequenceNum: 2, seatIndex: 3, phase: 'betting_flop' }),
    ],
  });
  const vm = buildTableViewModel(makeInput({ hand }));
  assert.equal(occupied(vm, 1).streetCommitted, 0);
  assert.equal(occupied(vm, 3).streetCommitted, 40, 'folded this street: chips stay in front');
});

test('toBotPersonality accepts rule personalities only', () => {
  assert.equal(toBotPersonality('tag'), 'tag');
  assert.equal(toBotPersonality('fish'), 'fish');
  assert.equal(toBotPersonality('gpt'), null);
  assert.equal(toBotPersonality(undefined), null);
});
