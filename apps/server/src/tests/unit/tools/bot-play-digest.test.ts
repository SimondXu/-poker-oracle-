import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import type { RuntimeRoom } from '../../../rooms/types.ts';
import { simulateBotStats } from '../../../tools/bot-simulator.ts';
import { playHalfDeal } from '../../../tools/duplicate-hu.ts';
import { POLICIES, type PolicyName } from '../../../tools/eval-policies.ts';
import { mixSeed } from '../../../tools/eval-utils.ts';

/**
 * Pins the bots' seeded play decision by decision, so a refactor of the strategy engine that
 * should not change play (e.g. the coach's Chooser seam) can prove it didn't. When bot strategy
 * changes on purpose, rerun this test and update the hashes in the same commit.
 */
const SEED = 20261011;

function sha256(lines: readonly string[]): string {
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

function headsUpDecisions(a: PolicyName, b: PolicyName, deals: number): string[] {
  const lines: string[] = [];
  const playerStats: RuntimeRoom['playerStats'] = new Map();
  for (let index = 0; index < deals; index += 1) {
    const shared = { dealSeed: mixSeed(SEED, index), stackBb: 100, bigBlind: 20, playerStats };
    for (const [salt, seats, ids] of [
      [1, [a, b], ['a', 'b']],
      [2, [b, a], ['b', 'a']],
    ] as const) {
      playHalfDeal({
        ...shared,
        policiesBySeat: [POLICIES[seats[0]], POLICIES[seats[1]]],
        idsBySeat: ids,
        decisionSalt: salt,
        onDecision: (context, action) => {
          lines.push(`${index}:${salt}:${context.phase}:${action.type}:${'amount' in action ? action.amount : ''}:${action.thinkingDelayMs}`);
        },
      });
    }
  }
  return lines;
}

test('seeded heads-up bot decisions are unchanged', () => {
  assert.equal(sha256(headsUpDecisions('tag', 'tag-random', 12)), '21f540f8f6d42e4f93b968cc9e50a2422b81e3c3b5d78e5ab2262fd25dd4779e');
  assert.equal(sha256(headsUpDecisions('lag', 'fish', 12)), '100732177e4bdb31023b17e8e1387d2dbbb5d2fb790f93a153fca6a7ae75bccb');
});

test('a seeded six-max run is unchanged (multiway pots, fold-streak options, 10bb stacks)', () => {
  const report = simulateBotStats({ hands: 60, seed: SEED, includeTrainingTable: false });
  assert.equal(sha256([JSON.stringify(report)]), '77ae7580c44f178cb2028cdc1ff277d920558a435c792fef4f28c510c66656dd');
});
