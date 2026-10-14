import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

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
