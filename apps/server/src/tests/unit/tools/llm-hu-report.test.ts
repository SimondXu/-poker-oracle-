import assert from 'node:assert/strict';
import test from 'node:test';

import type { MenuOption } from '@aipoker/agent-engine';

import type { CliDecisionTrace } from '../../../tools/llm-cli-policy.ts';
import { compareRows, formatComparison, parseSelector } from '../../../tools/llm-hu-compare.ts';
import { decisionMetrics, type DealLine } from '../../../tools/llm-hu-report.ts';

const option = (id: string, kind: MenuOption['kind'], toBb: number | null, potShare: number | null = null): MenuOption =>
  ({ id, kind, to: toBb === null ? null : toBb * 20, toBb, potShare, bluffBreakEven: null, sprAfter: null }) as MenuOption;

/** A river or flop decision with nothing to call: check, a pot-sized bet and the all-in on the menu. */
function trace(phase: 'flop' | 'turn' | 'river', equity: number, choice: 'A' | 'B' | 'C', source: 'llm' | 'fallback' = 'llm'): CliDecisionTrace {
  const menu = [option('A', 'check', 0), option('B', 'bet', 10, 1), option('C', 'all_in', 100, 10)];
  const chosen = menu.find((candidate) => candidate.id === choice)!;
  return {
    phase,
    menu,
    advice: { equity },
    decision: { source, choice, kind: chosen.kind },
  } as unknown as CliDecisionTrace;
}

test('decision metrics: river all-in share by equity, value left vs an all-in, flop/turn size and the weak-hand bet rate', () => {
  const metrics = decisionMetrics([
    trace('river', 0.9, 'C'), // all-in: nothing left
    trace('river', 0.9, 'B'), // pot-sized (10 bb): leaves 0.8 x 90
    trace('river', 0.9, 'A'), // check: leaves 0.8 x 100
    trace('river', 0.7, 'B'), // leaves 0.4 x 90
    trace('river', 0.55, 'A'), // leaves 0.1 x 100
    trace('river', 0.4, 'B'), // below 50%: not a value spot
    trace('river', 0.9, 'B', 'fallback'), // TAG played it, not the model
    trace('turn', 0.7, 'B'),
    trace('flop', 0.7, 'C'),
    trace('flop', 0.7, 'A'),
    trace('flop', 0.5, 'B'), // under 62%: neither value nor weak
    trace('flop', 0.2, 'B'),
    trace('turn', 0.3, 'A'),
  ]);
  assert.deepEqual(metrics.riverValue.buckets.map((bucket) => [bucket.spots, bucket.allIn]), [[1, 0], [1, 0], [3, 1]]);
  assert.equal(metrics.riverValue.buckets[2]!.allInShare, 1 / 3);
  assert.ok(Math.abs(metrics.riverValue.valueLeftBb - (0.8 * 90 + 0.8 * 100 + 0.4 * 90 + 0.1 * 100)) < 1e-9);
  assert.deepEqual(metrics.flopTurnValue, { spots: 3, bets: 2, atLeastPot: 2, medianPotShare: 5.5 });
  assert.deepEqual(metrics.bluff, { spots: 2, bets: 1, share: 0.5 });
});

const line = (row: string, opponent: string, match: number, deal: number, aBb: number): DealLine =>
  ({ key: `${row}|${opponent}|${match}`, row, opponent, match, deal, aBb, aStats: null, traces: [] });

test('two rows from different runs are paired by opponent, match and deal; a deal check compares their shared rule bot rows', () => {
  const pairs = [[0, 0], [0, 1], [1, 0], [1, 1]] as const;
  const runA = [
    ...pairs.map(([match, deal], index) => line('cli-claude/m/low/v0', 'station', match, deal, 10 * index)),
    ...pairs.map(([match, deal], index) => line('rule/tag', 'station', match, deal, index)),
  ];
  const runB = [
    ...pairs.map(([match, deal], index) => line('cli-claude/m/low/v1', 'station', match, deal, 10 * index + [2, 4, 6, 8][index]!)),
    ...pairs.map(([match, deal], index) => line('rule/tag', 'station', match, deal, index)),
    line('cli-claude/m/low/v1', 'tag', 0, 0, 5),
  ];
  const comparison = compareRows(runA, parseSelector('a'), runB, parseSelector('b:cli-claude/m/low/v1'));
  assert.equal(comparison.rowA, 'cli-claude/m/low/v0');
  assert.equal(comparison.opponents.length, 1);
  const station = comparison.opponents[0]!;
  assert.equal(station.pairs, 4);
  assert.equal(station.difference.bbPer100, 50 * 5);
  assert.ok(Math.abs(station.sdPerPair - Math.sqrt(20 / 3)) < 1e-9);
  assert.deepEqual(comparison.dealCheck, [{ row: 'rule/tag', pairs: 4, identical: 4 }]);
  assert.match(formatComparison(comparison), /B − A bb\/100/);

  const otherDeals = runB.map((entry) => (entry.row === 'rule/tag' ? { ...entry, aBb: entry.aBb + 1 } : entry));
  assert.equal(compareRows(runA, parseSelector('a'), otherDeals, parseSelector('b:cli')).dealCheck[0]!.identical, 0);
  assert.match(formatComparison(compareRows(runA, parseSelector('a'), otherDeals, parseSelector('b:cli'))), /did NOT play the same deals/);
  assert.throws(() => compareRows(runA, parseSelector('a:rule/zzz'), runB, parseSelector('b')), /no row match/);
});
