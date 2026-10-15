import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAction, getValidActions, initializeHand, type HandState, type PlayerActionInput } from '@aipoker/game-engine';
import type { BotDecisionContext } from '@aipoker/shared';
import { buildDecisionContext, createStableAnalysisRng } from '@aipoker/strategy-engine';

import { buildMenu, MENU_IDS, resolveChoice, toDecision } from './menu.ts';

type Rng = () => number;

/** A random legal action, biased toward calls so hands reach later streets. */
function randomAction(hand: HandState, rng: Rng): PlayerActionInput {
  const actor = hand.players.find((player) => player.seatIndex === hand.currentActorSeat)!;
  const valid = getValidActions(hand, actor.id);
  const roll = rng();
  if (roll < 0.12) {
    return { playerId: actor.id, type: valid.canCheck ? 'check' : 'fold' };
  }
  if (roll < 0.6 || (!valid.canRaise && !valid.canAllIn)) {
    return { playerId: actor.id, type: valid.canCheck ? 'check' : 'call' };
  }
  if (roll < 0.92 && valid.canRaise && valid.minRaiseTo < valid.maxRaiseTo) {
    const amount = valid.minRaiseTo + Math.floor(rng() * Math.min(valid.maxRaiseTo - valid.minRaiseTo, valid.minRaiseTo * 3));
    return { playerId: actor.id, type: 'raise_to', amount };
  }
  return { playerId: actor.id, type: valid.canAllIn ? 'all_in' : 'call' };
}

/** Seeded decision spots: 2-6 players, 3-250 bb stacks, a random number of random actions in. */
function seededSpots(count: number, seed: string): Array<{ hand: HandState; actorId: string; context: BotDecisionContext }> {
  const rng = createStableAnalysisRng(seed);
  const spots: Array<{ hand: HandState; actorId: string; context: BotDecisionContext }> = [];
  while (spots.length < count) {
    const playerCount = 2 + Math.floor(rng() * 5);
    const initialized = initializeHand({
      players: Array.from({ length: playerCount }, (_, seatIndex) => ({
        id: `p${seatIndex}`,
        seatIndex,
        stack: Math.round(20 * (3 + rng() * 247)),
      })),
      buttonMarkerSeat: Math.floor(rng() * playerCount),
      smallBlind: 10,
      bigBlind: 20,
      rng,
    });
    assert.ok(initialized.ok);
    let hand = initialized.value;
    const steps = Math.floor(rng() * 14);
    for (let step = 0; step < steps && hand.currentActorSeat !== null; step += 1) {
      const applied = applyAction(hand, randomAction(hand, rng), { timestamp: 0 });
      assert.ok(applied.ok);
      hand = applied.value;
    }
    const actor = hand.players.find((player) => player.seatIndex === hand.currentActorSeat);
    if (!actor) {
      continue;
    }
    const context = buildDecisionContext(
      { ...hand, smallBlind: hand.blinds.smallBlind, bigBlind: hand.blinds.bigBlind },
      actor.id,
      getValidActions(hand, actor.id),
    );
    assert.ok(context);
    spots.push({ hand, actorId: actor.id, context });
  }
  return spots;
}

test('every option on 1,000 seeded spots applies through applyAction, to the total it shows', () => {
  const kinds = new Map<string, number>();
  for (const { hand, actorId, context } of seededSpots(1_000, 'menu-legality')) {
    const menu = buildMenu(context);
    assert.ok(menu.length >= 1 && menu.length <= MENU_IDS.length);
    assert.deepEqual(menu.map((option) => option.id), MENU_IDS.slice(0, menu.length));
    assert.equal(new Set(menu.map((option) => option.to)).size, menu.length, 'totals are unique');

    for (const option of menu) {
      kinds.set(`${context.phase}:${option.kind}`, (kinds.get(`${context.phase}:${option.kind}`) ?? 0) + 1);
      const applied = applyAction(hand, { playerId: actorId, ...toDecision(option) }, { timestamp: 0 });
      assert.ok(applied.ok, `${option.id} ${option.kind} ${option.to} on ${JSON.stringify(context)}`);
      const record = applied.value.actions.at(-1)!;
      assert.equal(record.type, toDecision(option).type);
      assert.equal(record.type === 'fold' ? null : record.toAmount, option.to);
    }
  }
  // The spots reach every street and every kind of option.
  for (const key of ['preflop:raise', 'preflop:all_in', 'flop:bet', 'flop:raise', 'turn:bet', 'river:call', 'river:all_in']) {
    assert.ok((kinds.get(key) ?? 0) > 0, key);
  }
});

const FACING_BET: BotDecisionContext = {
  canFold: true,
  canCheck: false,
  canCall: true,
  callAmount: 35,
  canRaise: true,
  minRaiseTo: 70,
  maxRaiseTo: 1_950,
  canAllIn: true,
  phase: 'flop',
  potTotal: 145,
  myStack: 1_950,
  myStreetCommitted: 0,
  currentBetToMatch: 35,
  lastFullRaiseSize: 35,
  bigBlind: 20,
  smallBlind: 10,
  preflopLimpersCount: 0,
  streetActionCount: 2,
  holeCards: ['Kh', 'Qs'],
  communityCards: ['Kd', '7c', '2h'],
  activePlayerCount: 6,
  opponentCount: 1,
  position: 'bb',
  effectiveStack: 1_950,
  effectiveStackBb: 97.5,
  spr: 17.7,
  bettingState: 'facing_open',
  isPreflopAggressor: false,
  isLastStreetAggressor: false,
};

test("the spec's example spot gives its menu and arithmetic", () => {
  const menu = buildMenu(FACING_BET);
  assert.deepEqual(menu.map((option) => [option.id, option.kind, option.to]), [
    ['A', 'fold', null],
    ['B', 'call', 35],
    ['C', 'raise', 70],
    ['D', 'raise', 125],
    ['E', 'raise', 170],
    ['F', 'raise', 215],
    ['G', 'all_in', 1_950],
  ]);
  const raise = menu[2]!;
  assert.equal(raise.toBb, 3.5);
  assert.equal(raise.potShare!.toFixed(3), (35 / 180).toFixed(3));
  assert.equal(raise.bluffBreakEven!.toFixed(3), (70 / 215).toFixed(3));
  assert.equal(menu[5]!.potShare, 1);
  assert.equal(menu[0]!.potShare, null);
  assert.equal(menu[1]!.bluffBreakEven, null);
});

test('a raise that is not reopened leaves fold and call; a short stack calls all-in instead of raising', () => {
  const notReopened = buildMenu({ ...FACING_BET, canRaise: false, canAllIn: false });
  assert.deepEqual(notReopened.map((option) => option.kind), ['fold', 'call']);

  const short = buildMenu({ ...FACING_BET, myStack: 30, callAmount: 30, canRaise: false, canAllIn: true, maxRaiseTo: 30 });
  assert.deepEqual(short.map((option) => [option.kind, option.to]), [['fold', null], ['call', 30]]);
});

test('resolveChoice maps letters on the menu and rejects the rest', () => {
  const menu = buildMenu(FACING_BET);
  assert.deepEqual(resolveChoice(menu, 'B'), { type: 'call' });
  assert.deepEqual(resolveChoice(menu, 'D'), { type: 'raise_to', amount: 125 });
  assert.deepEqual(resolveChoice(menu, 'G'), { type: 'all_in' });
  assert.equal(resolveChoice(menu, 'H'), null);
  assert.equal(resolveChoice(menu, 'b'), null);
});
