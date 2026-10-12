import assert from 'node:assert/strict';
import test from 'node:test';

import type { BotAction, BotDecisionContext } from '@aipoker/shared';

import { simulateBotStats } from '../../../tools/bot-simulator.ts';
import { playDealPair, playHalfDeal, runDuplicateHu } from '../../../tools/duplicate-hu.ts';
import { POLICIES, parsePolicyName, type PolicyName } from '../../../tools/eval-policies.ts';
import { addToSample, createSample, summarizeSample } from '../../../tools/eval-utils.ts';

const PROBES: PolicyName[] = ['station', 'maniac-shove', 'overbettor'];

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
