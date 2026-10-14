import assert from 'node:assert/strict';
import test from 'node:test';

import type { BotAction } from '@aipoker/shared';

import type { RuntimeRoom } from '../../../rooms/types.ts';
import { playHalfDeal } from '../../../tools/duplicate-hu.ts';
import { playHalfDealAsync, playMatchAsync, ruleBotPolicy, runQueue, type AsyncPolicy } from '../../../tools/duplicate-hu-async.ts';
import { POLICIES, type PolicyName } from '../../../tools/eval-policies.ts';
import { mixSeed } from '../../../tools/eval-utils.ts';

const SEED = 777001;
const DEALS = 50;

const line = (index: number, salt: number, phase: string, action: BotAction) =>
  `${index}:${salt}:${phase}:${action.type}:${'amount' in action ? action.amount : ''}:${action.thinkingDelayMs}`;

const HALVES = (a: PolicyName, b: PolicyName) => [[1, [a, b], ['a', 'b']], [2, [b, a], ['b', 'a']]] as const;

/** The synchronous runner's play, deal by deal: the net result of each half and every decision. */
function syncPlay(a: PolicyName, b: PolicyName) {
  const decisions: string[] = [];
  const nets: Array<[number, number]> = [];
  const playerStats: RuntimeRoom['playerStats'] = new Map();
  for (let index = 0; index < DEALS; index += 1) {
    for (const [salt, seats, ids] of HALVES(a, b)) {
      const half = playHalfDeal({
        dealSeed: mixSeed(SEED, index),
        decisionSalt: salt,
        stackBb: 100,
        bigBlind: 20,
        policiesBySeat: [POLICIES[seats[0]], POLICIES[seats[1]]],
        idsBySeat: ids,
        playerStats,
        onDecision: (context, action) => decisions.push(line(index, salt, context.phase, action)),
      });
      nets.push(half.netBbBySeat);
    }
  }
  return { decisions, nets };
}

async function asyncPlay(a: PolicyName, b: PolicyName) {
  const decisions: string[] = [];
  const nets: Array<[number, number]> = [];
  const playerStats: RuntimeRoom['playerStats'] = new Map();
  for (let index = 0; index < DEALS; index += 1) {
    for (const [salt, seats, ids] of HALVES(a, b)) {
      const half = await playHalfDealAsync({
        dealSeed: mixSeed(SEED, index),
        decisionSalt: salt,
        stackBb: 100,
        bigBlind: 20,
        policiesBySeat: [ruleBotPolicy(POLICIES[seats[0]]), ruleBotPolicy(POLICIES[seats[1]])],
        idsBySeat: ids,
        playerStats,
        onDecision: (context, action) => decisions.push(line(index, salt, context.phase, action)),
      });
      nets.push(half.netBbBySeat);
    }
  }
  return { decisions, nets };
}

for (const [a, b] of [['tag', 'station'], ['tag', 'tag']] as const) {
  test(`the async runner reproduces the synchronous one on ${DEALS} deals of ${a} vs ${b}`, async () => {
    const expected = syncPlay(a, b);
    const actual = await asyncPlay(a, b);
    assert.ok(expected.decisions.length > DEALS);
    assert.deepEqual(actual.nets, expected.nets);
    assert.deepEqual(actual.decisions, expected.decisions);
  });
}

test('a match resumed from its state plays the same deals as one that never stopped', async () => {
  const run = { seed: SEED, a: ruleBotPolicy(POLICIES.tag), b: ruleBotPolicy(POLICIES.lag), stackBb: 100, bigBlind: 20 };
  const whole: number[] = [];
  const wholeEnd = await playMatchAsync(run, { nextDeal: 0, playerStats: [] }, 6, (record) => void whole.push(record.aBb));

  const first: number[] = [];
  const midway = await playMatchAsync(run, { nextDeal: 0, playerStats: [] }, 3, (record) => void first.push(record.aBb));
  const rest: number[] = [];
  const resumedEnd = await playMatchAsync(run, JSON.parse(JSON.stringify(midway)) as typeof midway, 6, (record) => void rest.push(record.aBb));

  assert.deepEqual([...first, ...rest], whole);
  assert.deepEqual(resumedEnd, wholeEnd);
});

test('a pair that throws leaves the match state where it was', async () => {
  const boom: AsyncPolicy = async () => {
    throw new Error('stop');
  };
  const run = { seed: SEED, a: boom, b: ruleBotPolicy(POLICIES.station), stackBb: 100, bigBlind: 20 };
  const state = { nextDeal: 2, playerStats: [] };
  await assert.rejects(playMatchAsync(run, state, 4, () => undefined), /stop/);
  assert.deepEqual(state, { nextDeal: 2, playerStats: [] });
});

test('the queue never runs more than the concurrency at once and rethrows the first failure', async () => {
  let running = 0;
  let peak = 0;
  await runQueue([1, 2, 3, 4, 5, 6], 2, async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
  });
  assert.equal(peak, 2);

  const started: number[] = [];
  await assert.rejects(runQueue([1, 2, 3, 4], 1, async (job) => {
    started.push(job);
    if (job === 2) {
      throw new Error('job 2');
    }
  }), /job 2/);
  assert.deepEqual(started, [1, 2]);
});
