import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { prepareDecision, RunControl } from '../../../tools/llm-cli-policy.ts';
import { cliPolicyFor, type Row } from '../../../tools/llm-hu.ts';
import { loadRun } from '../../../tools/llm-hu-replay.ts';
import { buildSpotFile, collectSpotInputs, formatSpotSummary, parseSelect, runSpots, type SpotFile } from '../../../tools/llm-hu-spots.ts';
import { CONFIG, fakeClaude, finishedRun } from './eval-fixtures.ts';

const RUN_ID = 'replay-test';

test('spots are built from a finished run, and their inputs come back exactly as the run saw them', async () => {
  const { dir, cleanup } = await finishedRun(CONFIG);
  try {
    const run = loadRun(RUN_ID, dir);
    const file: SpotFile = { version: 1, source: { kind: 'run', run: RUN_ID, dir }, spots: [] };
    const recorded = [...run.jobs.values()].flat().flatMap((line) => line.traces.map((entry) => ({ line, entry })));
    const picks = recorded.filter((_, index) => index % 9 === 0).slice(0, 6);
    file.spots = picks.map(({ line, entry }) => ({ key: line.key, deal: line.deal, half: entry.half, actionIndex: entry.trace.actionIndex, tag: 'any' }));

    const spots = await collectSpotInputs(file);
    assert.equal(spots.length, 6);
    spots.forEach((spot, index) => {
      const { entry } = picks[index]!;
      assert.equal(prepareDecision(spot.input, 'v0').userMessage, entry.trace.userMessage);
      assert.equal(spot.original!.choice, entry.trace.decision.choice);
    });
  } finally {
    cleanup();
  }
});

test('a simulated source gives the same spots every time, and selectors only take what they describe', async () => {
  const source = { kind: 'sim' as const, a: 'tag' as const, b: 'folder' as const, seed: 99, matches: 2, dealsPerMatch: 12, stackBb: 100, bigBlind: 20, snapshotPerPair: true };
  const select = parseSelect('postflop-facing=2,postflop-unbet=9');
  const first = await buildSpotFile(source, select, 1);
  const again = await buildSpotFile(source, select, 1);
  assert.deepEqual(again, first);
  assert.equal(first.spots.filter((spot) => spot.tag === 'postflop-facing').length, 2);
  assert.equal(first.spots.filter((spot) => spot.tag === 'postflop-unbet').length, 9);
  assert.notDeepEqual((await buildSpotFile(source, select, 2)).spots, first.spots);

  const inputs = await collectSpotInputs(first);
  for (const { spot, input, opponent } of inputs) {
    assert.equal(opponent, 'folder');
    assert.notEqual(input.context.phase, 'preflop');
    assert.equal(spot.tag === 'postflop-facing', input.context.callAmount > 0);
    assert.ok(input.handNumber > 0, 'snapshot mode numbers the hands');
  }
  assert.throws(() => parseSelect('river-value'), /name=count/);
  await assert.rejects(buildSpotFile(source, parseSelect('river-value=3'), 1), /Unknown selector/);
});

test('spots are asked once per row and resume skips what is on disk', async () => {
  const source = { kind: 'sim' as const, a: 'tag' as const, b: 'station' as const, seed: 5, matches: 1, dealsPerMatch: 6, stackBb: 100, bigBlind: 20, snapshotPerPair: false };
  const file = await buildSpotFile(source, parseSelect('postflop=5'), 3);
  const spots = await collectSpotInputs(file);
  const dir = mkdtempSync(join(tmpdir(), 'llm-hu-spots-'));
  try {
    let calls = 0;
    const claude = fakeClaude();
    const counting: typeof claude = async (args, options) => {
      calls += 1;
      return claude(args, options);
    };
    const control = new RunControl(100);
    const row: Row = { id: 'cli-claude/claude-haiku-5-5/low/v0', kind: 'cli', policy: null, model: 'claude-haiku-5-5', prompt: 'v0' };
    const rows = [{ id: row.id, policy: cliPolicyFor(CONFIG, row, control, counting) }];

    const lines = await runSpots({ dir, rows, spots, concurrency: 2 });
    assert.equal(lines.length, 5);
    assert.equal(calls, 5);
    assert.ok(lines.every((line) => line.opponent === 'station' && line.original === null && line.trace.validation?.ok));

    const again = await runSpots({ dir, rows, spots, concurrency: 2 });
    assert.equal(calls, 5);
    assert.equal(again.length, 5);
    assert.match(formatSpotSummary(again).join('\n'), /choice validity 100% \(5\/5\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

