import assert from 'node:assert/strict';
import test from 'node:test';

import { createToolContext, runTool } from '@aipoker/agent-engine';

import { exampleInput, renderExample, type ExampleSpot } from './example-spots.ts';

/**
 * The two examples of the prompt v1 design (`llm-bots.md`, "Prompt v1"), rendered by the engine:
 * (a) a near-lock on the river against a calling station, (b) a hand with no showdown value against
 * an opponent who folds a lot. The numbers are the engine's; the design's hand-computed ones agree
 * to a point or two. A change here is a change to what the model reads.
 */
const STATION: ExampleSpot = {
  stacks: [2000, 2000],
  script: [['a', 'raise_to', 60], ['b', 'call'], ['b', 'check'], ['a', 'check'], ['b', 'check'], ['a', 'raise_to', 60], ['b', 'call'], ['b', 'check']],
  hole: ['Ks', 'Kc'],
  board: ['Kd', '9h', '4c', '4d', '2s'],
  handNumber: 7,
  opponentStats: { hands: 6, preflopVoluntary: 6, preflopRaises: 0, preflopOversizedRaises: 0, postflopActions: 23, postflopAggressive: 0, postflopFacingBets: 11, postflopFoldsToBets: 0 },
  opponentLedger: {
    buckets: [{ faced: 4, folded: 0 }, { faced: 4, folded: 0 }, { faced: 3, folded: 0 }, { faced: 0, folded: 0 }],
    sumBase: 4 * 0.25 + 4 * 0.375 + 3 * 0.5,
    sawFlop: 5,
    showdowns: 4,
  },
};

const FOLDER: ExampleSpot = {
  stacks: [2000, 2148],
  script: [['a', 'raise_to', 44], ['b', 'call'], ['b', 'check'], ['a', 'raise_to', 30], ['b', 'call'], ['b', 'check'], ['a', 'check'], ['b', 'check']],
  hole: ['7h', '6h'],
  board: ['Kd', 'Tc', '3s', '2d', 'Js'],
  handNumber: 41,
  opponentStats: { hands: 40, preflopVoluntary: 15, preflopRaises: 7, preflopOversizedRaises: 0, postflopActions: 52, postflopAggressive: 16, postflopFacingBets: 25, postflopFoldsToBets: 17 },
  opponentLedger: {
    buckets: [{ faced: 8, folded: 5 }, { faced: 10, folded: 7 }, { faced: 6, folded: 5 }, { faced: 1, folded: 0 }],
    sumBase: 8 * 0.25 + 10 * 0.375 + 6 * 0.5 + 0.667,
    sawFlop: 22,
    showdowns: 6,
  },
};

const TAG_LIKE: ExampleSpot = {
  ...FOLDER,
  opponentStats: { ...FOLDER.opponentStats, preflopVoluntary: 10, postflopFacingBets: 24, postflopFoldsToBets: 10 },
  opponentLedger: {
    buckets: [{ faced: 8, folded: 3 }, { faced: 9, folded: 4 }, { faced: 6, folded: 3 }, { faced: 1, folded: 0 }],
    sumBase: 8 * 0.25 + 9 * 0.375 + 6 * 0.5 + 0.667,
    sawFlop: 22,
    showdowns: 6,
  },
};

const estimatesOf = (spot: ExampleSpot) =>
  (runTool(createToolContext(exampleInput(spot)), 'bet_estimates', { seat: null, option: null }).result as { options: Array<{ option: string; fold: number; bluffNeeds: number; gainBb: number }> }).options;

test('example (a): a near-lock against a station on the river, every size priced and the all-in worth the most', () => {
  assert.equal(renderExample(STATION), `HAND 7 · blinds 10/20 · 2 players · you are Seat 1 (BTN) · stack 1,880

HAND
Cards: Ks Kc (KK, top 1% of starting hands)
Board (river): Kd 9h 4c 4d 2s · two-tone, paired, not connected
Made: a full house · Draws: none

PRICE
Pot 240 · nothing to call · SPR at the start of the river 7.8 · effective stack 1,880 (94.0 bb)

EQUITY
100% (exact) against Seat 2's likely hands

OPPONENTS
Seat 2 · BB · stack 1,880 · 6 hands · VPIP 100% (n 6) · PFR 0% (n 6) · aggression after the flop 0% (n 23) · fold to a bet 0% (n 11)
  folds by bet size: under ½ pot 0 of 4 · ½-¾ pot 0 of 4 · about pot 0 of 3 · over pot 0 of 0 · went to showdown 4 of 5 flops
  read: rarely bets (bet or raised 0 of 23 actions after the flop)
  likely hands: about 43% of starting hands; on this board about 68% one pair, 32% two pair or better, 0% no pair; <1% beat you now

ACTION
Preflop (pot 30): you raise to 60 · Seat 2 BB call 60
Flop Kd 9h 4c (pot 120): Seat 2 BB check · you check
Turn 4d (pot 120): Seat 2 BB check · you bet 60 (50% of the pot) · Seat 2 BB call 60
River 2s (pot 240): Seat 2 BB check

MENU (nothing to call)
A  check
B  bet 80 · 4.0 bb · 33% of the pot · est. folds 6% (a bluff needs 25%) · gain vs check +3.8 bb
C  bet 120 · 6.0 bb · 50% of the pot · est. folds 9% (a bluff needs 33%) · gain vs check +5.5 bb
D  bet 180 · 9.0 bb · 75% of the pot · est. folds 12% (a bluff needs 43%) · gain vs check +7.9 bb
E  bet 240 · 12.0 bb · pot · est. folds 17% (a bluff needs 50%) · gain vs check +9.9 bb
F  bet 360 · 18.0 bb · 1.5× the pot · est. folds 39% (a bluff needs 60%) · gain vs check +11.0 bb
G  all-in 1,880 · 94.0 bb · 7.8× the pot · est. folds 77% (a bluff needs 89%) · gain vs check +21.7 bb`);

  const options = estimatesOf(STATION);
  assert.equal(options.at(-1)!.option, 'G');
  assert.deepEqual([...options].sort((left, right) => right.gainBb - left.gainBb)[0]!.option, 'G');
  options.forEach((option, index) => assert.ok(index === 0 || option.fold >= options[index - 1]!.fold));
  // No bluff clears its price anywhere short of the shove: nothing in the record says this player folds.
  assert.ok(options.slice(0, -2).every((option) => option.fold < option.bluffNeeds - 0.1));
});

test('example (b): no showdown value against a player who folds a lot, so the bluffs clear their price except the shove', () => {
  assert.equal(renderExample(FOLDER), `HAND 41 · blinds 10/20 · 2 players · you are Seat 1 (BTN) · stack 1,926

HAND
Cards: 7h 6h (76s, top 21% of starting hands)
Board (river): Kd Tc 3s 2d Js · two-tone, unpaired, not connected
Made: no pair · Draws: none

PRICE
Pot 148 · nothing to call · SPR at the start of the river 13.0 · effective stack 1,926 (96.3 bb)

EQUITY
2% (exact) against Seat 2's likely hands

OPPONENTS
Seat 2 · BB · stack 2,074 · 40 hands · VPIP 38% (n 40) · PFR 18% (n 40) · aggression after the flop 31% (n 52) · fold to a bet 68% (n 25)
  folds by bet size: under ½ pot 5 of 8 · ½-¾ pot 7 of 10 · about pot 5 of 6 · over pot 0 of 1 · went to showdown 6 of 22 flops
  read: folds a lot (folded 17 of 25 bets) → bluff where a size's fold estimate clears what the bluff needs
  likely hands: about 32% of starting hands; on this board about 62% one pair, 8% two pair or better, 30% no pair; 98% beat you now

ACTION
Preflop (pot 30): you raise to 44 · Seat 2 BB call 44
Flop Kd Tc 3s (pot 88): Seat 2 BB check · you bet 30 (34% of the pot) · Seat 2 BB call 30
Turn 2d (pot 148): Seat 2 BB check · you check
River Js (pot 148): Seat 2 BB check

MENU (nothing to call)
A  check
B  bet 49 · 2.5 bb · 33% of the pot · est. folds 56% (a bluff needs 25%) · gain vs check +2.9 bb
C  bet 74 · 3.7 bb · 50% of the pot · est. folds 65% (a bluff needs 33%) · gain vs check +3.4 bb
D  bet 111 · 5.5 bb · 75% of the pot · est. folds 68% (a bluff needs 43%) · gain vs check +3.1 bb
E  bet 148 · 7.4 bb · pot · est. folds 78% (a bluff needs 50%) · gain vs check +4.0 bb
F  bet 222 · 11.1 bb · 1.5× the pot · est. folds 78% (a bluff needs 60%) · gain vs check +3.2 bb
G  all-in 1,926 · 96.3 bb · 13.0× the pot · est. folds 78% (a bluff needs 93%) · gain vs check −15.7 bb`);

  const margins = estimatesOf(FOLDER).map((option) => option.fold - option.bluffNeeds);
  assert.ok(margins.slice(0, 5).every((margin) => margin >= 0.1));
  assert.ok(margins[5]! < 0);
  assert.ok(estimatesOf(FOLDER).slice(0, 5).every((option) => option.gainBb > 0) && estimatesOf(FOLDER)[5]!.gainBb < 0);
});

test('the same hand against a typical player: no size clears its price by 10 points, so the rule says check', () => {
  const options = estimatesOf(TAG_LIKE);
  assert.ok(options.every((option) => option.fold - option.bluffNeeds < 0.1));
  assert.ok(options.slice(0, 4).every((option) => Math.abs(option.gainBb) < 1));
  assert.equal(renderExample(TAG_LIKE).includes('read:'), false);
});

test('brief-0 of the same spots has no estimates and no ledger lines; the worst hands read "bottom" in brief-1 and "top 98%" in brief-0', () => {
  for (const spot of [STATION, FOLDER]) {
    const old = renderExample(spot, 'brief-0');
    assert.ok(!/est\. folds|folds by bet size|read:|stack-off|gain vs check/.test(old));
    assert.match(old, /bluff needs \d+% folds/);
  }
  const worst: ExampleSpot = { ...STATION, hole: ['7c', '3d'] };
  assert.match(renderExample(worst), /\(73o, bottom \d+% of starting hands\)/);
  assert.match(renderExample(worst, 'brief-0'), /\(73o, top 9\d% of starting hands\)/);
});
