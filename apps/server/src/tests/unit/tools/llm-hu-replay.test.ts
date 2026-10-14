import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { systemPromptsOf } from '../../../tools/llm-hu.ts';
import { loadDeals } from '../../../tools/llm-hu-report.ts';
import { loadRun, replayGate, walkRun } from '../../../tools/llm-hu-replay.ts';
import { CONFIG, finishedRun, MODEL } from './eval-fixtures.ts';

for (const snapshotPerPair of [false, true]) {
  test(`replay gate${snapshotPerPair ? ' in snapshot mode' : ''}: every user message of a finished run is rebuilt byte for byte, and tampering is caught`, async () => {
    const { dir, cleanup } = await finishedRun({ ...CONFIG, snapshotPerPair });
    try {
      const run = loadRun('replay-test', dir);
      const result = await replayGate(run);
      assert.deepEqual(result.problems, []);
      assert.equal(result.mismatches.length, 0);
      assert.ok(result.decisions > 40);
      assert.equal(result.identical, result.decisions);
      assert.equal(result.pairs, 20);
      assert.ok(run.jobs.get(`cli-claude/${MODEL}/low/v0|station|0`)![0]!.traces[0]!.trace.userMessage.startsWith(snapshotPerPair ? 'HAND 1' : 'HAND 0'));

      // Positive control: one changed character in one recorded message is found, and nothing else is.
      const path = join(dir, 'deals.jsonl');
      const lines = readFileSync(path, 'utf8').trim().split('\n');
      const edited = JSON.parse(lines[3]!) as { traces: Array<{ trace: { userMessage: string } }> };
      edited.traces[1]!.trace.userMessage = edited.traces[1]!.trace.userMessage.replace('Pot ', 'Pit ');
      lines[3] = JSON.stringify(edited);
      writeFileSync(path, `${lines.join('\n')}\n`);
      const tampered = await replayGate(loadRun('replay-test', dir));
      assert.equal(tampered.mismatches.length, 1);
      assert.equal(tampered.identical, tampered.decisions - 1);
      assert.match(tampered.mismatches[0]!.recorded, /Pit /);
    } finally {
      cleanup();
    }
  });
}

test('replay: a wrong seed leaves the recorded path and says so; a run without its seed cannot be replayed', async () => {
  const { dir, cleanup } = await finishedRun(CONFIG);
  try {
    const checkpointPath = join(dir, 'checkpoint.json');
    const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8')) as { seed: number | null };
    writeFileSync(checkpointPath, JSON.stringify({ ...checkpoint, seed: 5 }));
    const summary = await walkRun(loadRun('replay-test', dir), () => undefined);
    assert.ok(summary.problems.length > 0);

    writeFileSync(checkpointPath, JSON.stringify({ ...checkpoint, seed: null }));
    assert.throws(() => loadRun('replay-test', dir), /no seed/);
  } finally {
    cleanup();
  }
});

test('walkRun can stop each job early, and visits only the model seat', async () => {
  const { dir, cleanup } = await finishedRun(CONFIG);
  try {
    const run = loadRun('replay-test', dir);
    const seen: number[] = [];
    const summary = await walkRun(run, ({ deal }) => void seen.push(deal), { dealsOf: (_key, recorded) => Math.min(2, recorded) });
    assert.equal(summary.pairs, 8);
    assert.deepEqual(summary.problems, []);
    assert.ok(seen.every((deal) => deal < 2));
  } finally {
    cleanup();
  }
});

test('a run with both prompt versions: v1 rows carry the ledger and what they were shown, hands line up with decisions, and the gate holds for brief-1', async () => {
  const personas = { v0: 'analyst', v1: 'exploiter' } as const;
  const config = { ...CONFIG, prompts: ['v0', 'v1'] as const, personas, snapshotPerPair: true, systemSha256: systemPromptsOf(['v0', 'v1'], personas) };
  const { dir, cleanup } = await finishedRun({ ...config, prompts: [...config.prompts] });
  try {
    const run = loadRun('replay-test', dir);
    const gate = await replayGate(run);
    assert.deepEqual(gate.problems, []);
    assert.equal(gate.mismatches.length, 0);
    assert.equal(gate.identical, gate.decisions);

    const lines = loadDeals(join(dir, 'deals.jsonl')).filter((line) => line.row.startsWith('cli-'));
    assert.deepEqual([...new Set(lines.map((line) => line.row))].sort(), [`cli-claude/${MODEL}/low/v0`, `cli-claude/${MODEL}/low/v1`]);
    for (const line of lines) {
      for (const { half, trace } of line.traces) {
        const actions = line.hands!.find((hand) => hand.half === half)!.actions;
        assert.equal(actions[trace.actionIndex]!.player, 'a', 'the decision is the bot\'s own action in the hand log');
        assert.equal(trace.prompt, line.row.endsWith('/v1') ? 'v1' : 'v0');
        assert.equal(trace.ledger === null, trace.prompt === 'v0');
        assert.equal(trace.exploit === null, trace.prompt === 'v0');
      }
    }
    const v1 = lines.filter((line) => line.row.endsWith('/v1')).flatMap((line) => line.traces.map((entry) => entry.trace));
    assert.ok(v1.some((trace) => trace.exploit!.estimates.length > 0));
    assert.ok(v1.every((trace) => trace.ledger!.hash.length === 64));
    assert.match(v1[0]!.userMessage, /^HAND \d+/);
    assert.ok(v1.some((trace) => trace.userMessage.includes('folds by bet size')));
  } finally {
    cleanup();
  }
});
