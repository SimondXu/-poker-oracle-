import { fileURLToPath } from 'node:url';

import { addToSample, createSample, summarizeSample, type WinRateSummary } from './eval-utils.ts';
import { EVAL_DIR } from './llm-hu-replay.ts';
import { loadDeals, type DealLine } from './llm-hu-report.ts';

/**
 * Two rows on the same deals, possibly from different runs (a v1 run replays a finished run's seed
 * with `--same-deals-as`, so its pairs line up with the old ones). Pairs are matched by opponent,
 * match and deal; the difference is B minus A per pair, in the report's bb/100.
 */
export interface RowSelector {
  /** The run's directory name under the eval directory. */
  run: string;
  /** The start of the row id; empty takes the run's only CLI row. */
  rowPrefix: string;
}

export interface PairedDifference {
  opponent: string;
  pairs: number;
  a: WinRateSummary;
  b: WinRateSummary;
  /** B minus A, bb/100 with a 95% interval. */
  difference: WinRateSummary;
  /** Standard deviation of the difference per deal pair, in bb (the unit the sample sizes are planned in). */
  sdPerPair: number;
}

export interface Comparison {
  rowA: string;
  rowB: string;
  opponents: PairedDifference[];
  /** Rule bot rows both runs hold, with how many pairs came out identical: a check that the deals were the same. */
  dealCheck: Array<{ row: string; pairs: number; identical: number }>;
}

export function parseSelector(text: string): RowSelector {
  const [run, ...rest] = text.split(':');
  if (!run) {
    throw new Error(`"${text}" is not <run>[:<row prefix>]`);
  }
  return { run, rowPrefix: rest.join(':') };
}

const pairKey = (line: DealLine) => `${line.opponent}|${line.match}|${line.deal}`;

function rowOf(lines: readonly DealLine[], selector: RowSelector): string {
  const rows = [...new Set(lines.map((line) => line.row))].filter((row) => (selector.rowPrefix ? row.startsWith(selector.rowPrefix) : row.startsWith('cli-')));
  if (rows.length !== 1) {
    throw new Error(`Run ${selector.run}: ${rows.length === 0 ? 'no row' : `${rows.length} rows (${rows.join(', ')})`} match "${selector.rowPrefix || 'cli-'}"; name one with <run>:<row prefix>`);
  }
  return rows[0]!;
}

export function compareRows(linesA: readonly DealLine[], selectorA: RowSelector, linesB: readonly DealLine[], selectorB: RowSelector): Comparison {
  const rowA = rowOf(linesA, selectorA);
  const rowB = rowOf(linesB, selectorB);
  const resultsOf = (lines: readonly DealLine[], row: string) => new Map(lines.filter((line) => line.row === row).map((line) => [pairKey(line), line]));
  const a = resultsOf(linesA, rowA);
  const b = resultsOf(linesB, rowB);

  const opponents = [...new Set([...a.values()].map((line) => line.opponent))].filter((opponent) => [...b.values()].some((line) => line.opponent === opponent));
  const out: PairedDifference[] = opponents.map((opponent) => {
    const sampleA = createSample();
    const sampleB = createSample();
    const sampleDiff = createSample();
    for (const [key, lineA] of a) {
      const lineB = b.get(key);
      if (lineA.opponent === opponent && lineB) {
        addToSample(sampleA, lineA.aBb);
        addToSample(sampleB, lineB.aBb);
        addToSample(sampleDiff, lineB.aBb - lineA.aBb);
      }
    }
    const mean = sampleDiff.n === 0 ? 0 : sampleDiff.sum / sampleDiff.n;
    const variance = sampleDiff.n > 1 ? Math.max(0, (sampleDiff.sumSq - sampleDiff.n * mean * mean) / (sampleDiff.n - 1)) : 0;
    return {
      opponent,
      pairs: sampleDiff.n,
      a: summarizeSample(sampleA, 2),
      b: summarizeSample(sampleB, 2),
      difference: summarizeSample(sampleDiff, 2),
      sdPerPair: Math.sqrt(variance),
    };
  });

  const ruleRows = [...new Set(linesA.map((line) => line.row))].filter((row) => row.startsWith('rule/') && linesB.some((line) => line.row === row));
  const dealCheck = ruleRows.map((row) => {
    const own = resultsOf(linesA, row);
    const other = resultsOf(linesB, row);
    const shared = [...own].filter(([key]) => other.has(key));
    return { row, pairs: shared.length, identical: shared.filter(([key, line]) => other.get(key)!.aBb === line.aBb).length };
  });
  return { rowA, rowB, opponents: out, dealCheck };
}

const f = (value: number, digits = 0) => value.toFixed(digits);
const win = (summary: WinRateSummary) => `${f(summary.bbPer100)} ± ${f(summary.ci95)}`;

export function formatComparison(comparison: Comparison): string {
  const out = [`A ${comparison.rowA}`, `B ${comparison.rowB}`, 'opponent · pairs · A bb/100 · B bb/100 · B − A bb/100 ± 95% CI · sd per pair (bb)'];
  for (const entry of comparison.opponents) {
    out.push(`${entry.opponent} · ${entry.pairs} · ${win(entry.a)} · ${win(entry.b)} · ${win(entry.difference)} · ${f(entry.sdPerPair, 1)}`);
  }
  for (const check of comparison.dealCheck) {
    out.push(`deal check ${check.row}: ${check.identical} of ${check.pairs} shared pairs came out identical${check.identical === check.pairs ? '' : '  (different deals, or a rule bot that reads opponent statistics updated on a different schedule, e.g. snapshot mode)'}`);
  }
  if (comparison.dealCheck.length === 0) {
    out.push('deal check: the runs share no rule bot row, so the deals are not verified');
  }
  return out.join('\n');
}

const dealsOf = (run: string) => loadDeals(`${EVAL_DIR}${run}/deals.jsonl`);

async function main(): Promise<void> {
  const [first, second] = process.argv.slice(2);
  if (!first || !second) {
    throw new Error('usage: eval:llm-hu-compare <run>[:<row prefix>] <run>[:<row prefix>]   (prints B minus A on the same deals)');
  }
  const a = parseSelector(first);
  const b = parseSelector(second);
  console.log(formatComparison(compareRows(dealsOf(a.run), a, dealsOf(b.run), b)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
