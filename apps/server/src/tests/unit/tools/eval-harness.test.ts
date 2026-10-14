import assert from 'node:assert/strict';
import test from 'node:test';

import type { BotAction, BotDecisionContext } from '@aipoker/shared';

import { simulateBotStats } from '../../../tools/bot-simulator.ts';
import { playDealPair, playHalfDeal, runDuplicateHu } from '../../../tools/duplicate-hu.ts';
import { POLICIES, parsePolicyName, type PolicyName } from '../../../tools/eval-policies.ts';
import { addToSample, createSample, summarizeSample } from '../../../tools/eval-utils.ts';

const PROBES: PolicyName[] = ['station', 'maniac-shove', 'overbettor', 'folder', 'calldown'];

function assertLegal(context: BotDecisionContext, action: BotAction): void {
  switch (action.type) {
    case 'fold':
      assert.ok(context.canFold);
      break;
    case 'check':
      assert.ok(context.canCheck);
      break;
    case 'call':
      assert.ok(context.canCall);
      assert.equal(action.amount, context.callAmount);
      break;
    case 'raise_to':
      assert.ok(context.canRaise);
      assert.ok(action.amount >= context.minRaiseTo && action.amount <= context.maxRaiseTo);
      break;
    case 'all_in':
      assert.ok(context.canAllIn);
      break;
  }
}

test('summarizeSample computes bb/100 and a 95% CI from a known sample', () => {
  const sample = createSample();
  for (const value of [1, 2, 3, 4, 5]) {
    addToSample(sample, value);
  }

  // mean 3, sample sd sqrt(2.5), se = sd / sqrt(5) = sqrt(0.5)
  const perHand = summarizeSample(sample);
  assert.equal(perHand.n, 5);
  assert.ok(Math.abs(perHand.bbPer100 - 300) < 1e-9);
  assert.ok(Math.abs(perHand.ci95 - 1.96 * Math.sqrt(0.5) * 100) < 1e-9);

  // Duplicate pairs cover two hands each, so the same sample halves per 100 hands.
  const perPair = summarizeSample(sample, 2);
  assert.ok(Math.abs(perPair.bbPer100 - 150) < 1e-9);
  assert.ok(Math.abs(perPair.ci95 - 0.5 * perHand.ci95) < 1e-9);

  assert.deepEqual(summarizeSample(createSample()), { n: 0, bbPer100: 0, ci95: 0 });
});

test('duplicate heads-up is deterministic for a given seed', () => {
  const first = runDuplicateHu({ a: 'lag', b: 'tag', deals: 6, seed: 42 });
  const second = runDuplicateHu({ a: 'lag', b: 'tag', deals: 6, seed: 42 });
  const other = runDuplicateHu({ a: 'lag', b: 'tag', deals: 6, seed: 43 });

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.notEqual(JSON.stringify(first.aWinRate), JSON.stringify(other.aWinRate));
});

test('a seat swap replays the identical deck and cancels card luck for identical policies', () => {
  const asButton = playHalfDeal({ policiesBySeat: [POLICIES.station, POLICIES['maniac-shove']], dealSeed: 99, decisionSalt: 1, stackBb: 100, bigBlind: 20 });
  const swapped = playHalfDeal({ policiesBySeat: [POLICIES['maniac-shove'], POLICIES.station], dealSeed: 99, decisionSalt: 2, stackBb: 100, bigBlind: 20 });
  const otherDeal = playHalfDeal({ policiesBySeat: [POLICIES.station, POLICIES['maniac-shove']], dealSeed: 100, decisionSalt: 1, stackBb: 100, bigBlind: 20 });

  assert.deepEqual(swapped.deal, asButton.deal);
  assert.notDeepEqual(otherDeal.deal.deck, asButton.deal.deck);
  assert.equal(asButton.netBbBySeat[0] + asButton.netBbBySeat[1], 0);

  for (let index = 0; index < 25; index += 1) {
    assert.equal(playDealPair({ a: 'station', b: 'station', seed: 7, index, stackBb: 100, bigBlind: 20 }), 0);
  }
});

test('probe policies only emit legal actions over a few hundred random hands', () => {
  let decisions = 0;
  let hands = 0;
  for (const a of PROBES) {
    for (const b of PROBES) {
      for (let deal = 0; deal < 40; deal += 1) {
        playHalfDeal({
          policiesBySeat: [POLICIES[a], POLICIES[b]],
          dealSeed: deal * 7919 + 1,
          decisionSalt: 1,
          stackBb: 20 + (deal % 5) * 40,
          bigBlind: 20,
          onDecision: (context, action) => {
            decisions += 1;
            assertLegal(context, action);
          },
        });
        hands += 1;
      }
    }
  }

  assert.ok(hands >= 300);
  assert.ok(decisions > hands);
});

test('policy names are validated', () => {
  assert.equal(parsePolicyName('overbettor'), 'overbettor');
  assert.throws(() => parsePolicyName('nit'));
});

test('tag vs station duplicate heads-up yields a finite win rate', () => {
  const report = runDuplicateHu({ a: 'tag', b: 'station', deals: 15, seed: 1 });

  assert.equal(report.hands, 30);
  assert.equal(report.aWinRate.n, 15);
  assert.ok(Number.isFinite(report.aWinRate.bbPer100));
  assert.ok(Number.isFinite(report.aWinRate.ci95));
});

test('ring simulation reports per-player win rates that sum to zero', () => {
  const report = simulateBotStats({ hands: 12, seed: 5, includeTrainingTable: false });
  const players = Object.values(report.overall.players);

  assert.ok(players.every((player) => player.winRate.n === 12));
  assert.ok(Math.abs(players.reduce((sum, player) => sum + player.winRate.bbPer100, 0)) < 1e-6);
});

/** Only what the probes read; they play TAG before the flop, so these are all postflop spots. */
function spot(hole: string, board: string, facingBet: boolean): BotDecisionContext {
  const community = board.split(' ');
  return {
    phase: community.length === 3 ? 'flop' : community.length === 4 ? 'turn' : 'river',
    holeCards: hole.split(' '),
    communityCards: community,
    canFold: facingBet,
    canCheck: !facingBet,
    canCall: facingBet,
    callAmount: facingBet ? 60 : 0,
  } as unknown as BotDecisionContext;
}

const decide = (policy: PolicyName, hole: string, board: string, facingBet: boolean) =>
  POLICIES[policy](spot(hole, board, facingBet), () => 0.5).type;

test('folder keeps top pair or better and strong draws before the river, folds the rest, and never raises a bet', () => {
  const calls: Array<[string, string]> = [
    ['Ah Kd', 'Ac 7d 2s'], // top pair
    ['9s 9d', '2c 3d 7h'], // overpair
    ['Ah Td', 'Ac Ts 3d'], // two pair
    ['Ah Ks', 'Kc 8d 3s'], // top pair with the lower hole card
    ['9h 8h', 'Kh 7h 2c'], // flush draw
    ['9h 8d', '6c 7d Ks'], // open-ended straight draw
  ];
  const folds: Array<[string, string]> = [
    ['6s 6d', 'Ac Kd 2h'], // a pocket pair below the board
    ['Ah 7s', 'Kc 7d 2h'], // second pair
    ['7h 6h', 'Kd Tc 3s'], // nothing
    ['9h 8d', '6c 5d Ks'], // gutshot only
    ['9h 8h', 'Kh 7h 2c 3d 4s'], // the river: the draws have missed
  ];
  for (const [hole, board] of calls) {
    assert.equal(decide('folder', hole, board, true), 'call', `${hole} on ${board}`);
  }
  for (const [hole, board] of folds) {
    assert.equal(decide('folder', hole, board, true), 'fold', `${hole} on ${board}`);
  }
  assert.equal(decide('folder', 'Ah Ad', 'Ac Kd 2s', true), 'call');
  assert.equal(decide('folder', 'Ah Ad', 'Ac Kd 2s', false), POLICIES.tag(spot('Ah Ad', 'Ac Kd 2s', false), () => 0.5).type);
});

test('calldown never folds a pair or a draw, folds with neither, and never bets or raises', () => {
  for (const [hole, board] of [['6s 6d', 'Ac Kd 2h'], ['Ah 7s', 'Kc 7d 2h'], ['9h 8d', '6c 5d Ks'], ['9h 8h', 'Kh 7h 2c']]) {
    assert.equal(decide('calldown', hole!, board!, true), 'call', `${hole} on ${board}`);
  }
  for (const [hole, board] of [['7h 6h', 'Kd Tc 3s'], ['Ah 3s', 'Kc 8d 2h'], ['9h 8h', 'Kd 7h 2c 3d 4s']]) {
    assert.equal(decide('calldown', hole!, board!, true), 'fold', `${hole} on ${board}`);
  }
  assert.equal(decide('calldown', 'Ah Ad', 'Ac Ad Kd', false), 'check');
  // Backdoor draws and overcards are not draws.
  assert.equal(decide('calldown', 'Ah Kh', '7h 8c 2d', true), 'fold');
});

test('folder and calldown fold to bets at different rates over seeded duplicate play against TAG', () => {
  const foldToBet = (b: PolicyName) => {
    let facing = 0;
    let folds = 0;
    for (let deal = 0; deal < 60; deal += 1) {
      for (const [salt, seats] of [[1, ['tag', b]], [2, [b, 'tag']]] as const) {
        playHalfDeal({
          policiesBySeat: [POLICIES[seats[0]], POLICIES[seats[1]]],
          dealSeed: deal * 104729 + 3,
          decisionSalt: salt,
          stackBb: 100,
          bigBlind: 20,
          onDecision: (context, action) => {
            const mine = seats[context.position === 'btn' ? 0 : 1] === b;
            if (mine && context.phase !== 'preflop' && context.callAmount > 0) {
              facing += 1;
              folds += action.type === 'fold' ? 1 : 0;
            }
          },
        });
      }
    }
    return folds / facing;
  };
  const folder = foldToBet('folder');
  const calldown = foldToBet('calldown');
  assert.ok(folder > 0.4 && folder < 0.85, `folder ${folder}`);
  assert.ok(calldown > 0.1 && calldown < 0.5, `calldown ${calldown}`);
  assert.ok(folder > calldown + 0.15);
});
