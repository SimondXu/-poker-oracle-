import { readFileSync } from 'node:fs';

import type { BotPlayerStats, CoachVerdict } from '@aipoker/shared';

import type { CliDecisionTrace } from './llm-cli-policy.ts';
import { FALLBACK_LIMIT } from './llm-cli-policy.ts';
import { addToSample, createSample, mulberry32, summarizeSample, type WinRateSummary } from './eval-utils.ts';

/** One deal pair of one match, as `deals.jsonl` stores it. The deal itself is never written. */
export interface DealLine {
  key: string;
  row: string;
  opponent: string;
  match: number;
  deal: number;
  /** The row's player A, in big blinds over both halves. */
  aBb: number;
  aStats: BotPlayerStats | null;
  traces: Array<{ half: 1 | 2; trace: CliDecisionTrace }>;
}

export interface RowMeta {
  id: string;
  kind: 'cli' | 'rule';
}

export interface ReportMeta {
  runId: string;
  /** Revealed at the end of a run; null while it is paused. */
  seed: number | null;
  status: string;
  claudeVersion: string | null;
  promptVersion: string;
  promptSha256: string;
  effort: string;
}

export interface Percentiles {
  p50: number;
  p95: number;
  max: number;
}

export interface Agreement {
  decisions: number;
  matched: number;
  close: number;
  off: number;
  /** Matched share, with a 95% bootstrap interval over deal pairs. */
  matchedShare: number;
  ci95: [number, number];
}

export interface CliMetrics {
  decisions: number;
  fallbackRate: number;
  contaminated: boolean;
  fallbackReasons: Record<string, number>;
  /** A valid letter on the menu, before any fallback. */
  choiceValidity: number;
  /** A valid letter and nothing wrong with the note or the talk. */
  fullValidity: number;
  wallMs: Percentiles;
  apiMs: Percentiles;
  ttftMs: Percentiles;
  turns: { mean: number; max: number };
  tokensPerDecision: { input: number; output: number; cacheRead: number; cacheCreation: number; thinking: number };
  /** The CLI's list price for the calls; the subscription is not charged per call. */
  notionalUsd: number;
  agreement: { all: Agreement; preflop: Agreement; postflop: Agreement };
  priceBlunders: { count: number; ofDecisionsFacingABet: number; rate: number };
  models: string[];
}

export interface GroupReport {
  row: string;
  opponent: string;
  deals: number;
  bbPer100: WinRateSummary;
  /** Row minus the baseline as player A on the same deals, in bb/100; null for the baseline itself. */
  versus: Record<string, WinRateSummary | null>;
  stats: { vpip: number; pfr: number; aggression: number; foldToBet: number } | null;
  cli: CliMetrics | null;
}

export interface Report {
  meta: ReportMeta;
  groups: GroupReport[];
}

export const PAIRED_BASELINES = ['tag', 'fish'] as const;
const BOOTSTRAPS = 1_000;

/** Reads `deals.jsonl`; a pair written twice (a crash between the record and the checkpoint) counts once. */
export function loadDeals(path: string): DealLine[] {
  const byPair = new Map<string, DealLine>();
  for (const text of readFileSync(path, 'utf8').split('\n')) {
    if (text.trim()) {
      const line = JSON.parse(text) as DealLine;
      byPair.set(`${line.key}#${line.deal}`, line);
    }
  }
  return [...byPair.values()];
}

export function percentiles(values: number[]): Percentiles {
  const sorted = [...values].sort((left, right) => left - right);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
  return { p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
}

const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

function winRate(values: number[]): WinRateSummary {
  const sample = createSample();
  values.forEach((value) => addToSample(sample, value));
  return summarizeSample(sample, 2);
}

type Counts = Record<CoachVerdict, number>;

function agreementOf(units: Array<Counts>): Agreement {
  const total = units.reduce<Counts>((sum, unit) => ({ matched: sum.matched + unit.matched, close: sum.close + unit.close, off: sum.off + unit.off }), { matched: 0, close: 0, off: 0 });
  const decisions = total.matched + total.close + total.off;
  const share = (counts: Counts) => {
    const n = counts.matched + counts.close + counts.off;
    return n === 0 ? 0 : counts.matched / n;
  };
  const rng = mulberry32(20261013);
  const shares: number[] = [];
  for (let round = 0; round < BOOTSTRAPS && units.length > 0; round += 1) {
    const resampled: Counts = { matched: 0, close: 0, off: 0 };
    for (let pick = 0; pick < units.length; pick += 1) {
      const unit = units[Math.floor(rng() * units.length)]!;
      resampled.matched += unit.matched;
      resampled.close += unit.close;
      resampled.off += unit.off;
    }
    shares.push(share(resampled));
  }
  shares.sort((left, right) => left - right);
  const bound = (p: number) => shares[Math.min(shares.length - 1, Math.floor(p * shares.length))] ?? 0;
  return { decisions, ...total, matchedShare: share(total), ci95: [bound(0.025), bound(0.975)] };
}

function cliMetrics(lines: DealLine[]): CliMetrics {
  const traces = lines.flatMap((line) => line.traces.map((entry) => entry.trace));
  const llm = traces.filter((trace) => trace.decision.source === 'llm');
  const fallbackReasons: Record<string, number> = {};
  for (const trace of traces) {
    if (trace.decision.fallbackReason) {
      fallbackReasons[trace.decision.fallbackReason] = (fallbackReasons[trace.decision.fallbackReason] ?? 0) + 1;
    }
  }
  const metas = traces.flatMap((trace) => (trace.call.meta ? [trace.call.meta] : []));
  const perDecision = (pick: (meta: (typeof metas)[number]) => number) => mean(metas.map(pick));

  const countsOf = (selected: CliDecisionTrace[]): Counts => {
    const counts: Counts = { matched: 0, close: 0, off: 0 };
    selected.forEach((trace) => (counts[trace.verdict] += 1));
    return counts;
  };
  const unitsOf = (pick: (trace: CliDecisionTrace) => boolean) =>
    lines.map((line) => countsOf(line.traces.map((entry) => entry.trace).filter((trace) => trace.decision.source === 'llm' && pick(trace))));

  const priceSpots = llm.filter((trace) => trace.menu.some((option) => option.kind === 'fold') && trace.advice.equity !== null);
  const blunders = priceSpots.filter((trace) => trace.blunder !== null).length;
  return {
    decisions: traces.length,
    fallbackRate: traces.length === 0 ? 0 : (traces.length - llm.length) / traces.length,
    contaminated: traces.length > 0 && (traces.length - llm.length) / traces.length > FALLBACK_LIMIT,
    fallbackReasons,
    choiceValidity: traces.length === 0 ? 0 : traces.filter((trace) => trace.validation?.ok).length / traces.length,
    fullValidity: traces.length === 0 ? 0 : traces.filter((trace) => trace.validation?.ok && trace.validation.errors.length === 0).length / traces.length,
    wallMs: percentiles(traces.map((trace) => trace.call.wallMs)),
    apiMs: percentiles(metas.flatMap((meta) => (meta.durationApiMs === null ? [] : [meta.durationApiMs]))),
    ttftMs: percentiles(metas.flatMap((meta) => (meta.ttftMs === null ? [] : [meta.ttftMs]))),
    turns: { mean: perDecision((meta) => meta.numTurns), max: Math.max(0, ...metas.map((meta) => meta.numTurns)) },
    tokensPerDecision: {
      input: perDecision((meta) => meta.usage.input),
      output: perDecision((meta) => meta.usage.output),
      cacheRead: perDecision((meta) => meta.usage.cacheRead),
      cacheCreation: perDecision((meta) => meta.usage.cacheCreation),
      thinking: perDecision((meta) => meta.usage.thinking),
    },
    notionalUsd: metas.reduce((sum, meta) => sum + (meta.notionalUsd ?? 0), 0),
    agreement: {
      all: agreementOf(unitsOf(() => true)),
      preflop: agreementOf(unitsOf((trace) => trace.phase === 'preflop')),
      postflop: agreementOf(unitsOf((trace) => trace.phase !== 'preflop')),
    },
    priceBlunders: { count: blunders, ofDecisionsFacingABet: priceSpots.length, rate: priceSpots.length === 0 ? 0 : blunders / priceSpots.length },
    models: [...new Set(metas.flatMap((meta) => meta.models))],
  };
}

/** The bot's own tendencies: the last statistics of each match, summed. */
function tendencies(lines: DealLine[]): GroupReport['stats'] {
  const last = new Map<string, DealLine>();
  for (const line of lines) {
    if (line.aStats && (last.get(line.key)?.deal ?? -1) < line.deal) {
      last.set(line.key, line);
    }
  }
  const total = { hands: 0, preflopVoluntary: 0, preflopRaises: 0, postflopActions: 0, postflopAggressive: 0, postflopFacingBets: 0, postflopFoldsToBets: 0 };
  for (const { aStats } of last.values()) {
    for (const field of Object.keys(total) as Array<keyof typeof total>) {
      total[field] += aStats![field];
    }
  }
  const share = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);
  return last.size === 0
    ? null
    : {
        vpip: share(total.preflopVoluntary, total.hands),
        pfr: share(total.preflopRaises, total.hands),
        aggression: share(total.postflopAggressive, total.postflopActions),
        foldToBet: share(total.postflopFoldsToBets, total.postflopFacingBets),
      };
}

export function buildReport(lines: DealLine[], rows: RowMeta[], opponents: string[], meta: ReportMeta): Report {
  const pairKey = (line: DealLine) => `${line.match}#${line.deal}`;
  const groups: GroupReport[] = [];
  for (const opponent of opponents) {
    const resultsOf = (row: string) => new Map(lines.filter((line) => line.row === row && line.opponent === opponent).map((line) => [pairKey(line), line.aBb]));
    for (const row of rows) {
      const own = lines.filter((line) => line.row === row.id && line.opponent === opponent);
      if (own.length === 0) {
        continue;
      }
      const mine = resultsOf(row.id);
      const versus: GroupReport['versus'] = {};
      for (const baseline of PAIRED_BASELINES) {
        const baselineId = `rule/${baseline}`;
        const theirs = resultsOf(baselineId);
        versus[baseline] = row.id === baselineId ? null : winRate([...mine].flatMap(([key, value]) => (theirs.has(key) ? [value - theirs.get(key)!] : [])));
      }
      groups.push({
        row: row.id,
        opponent,
        deals: own.length,
        bbPer100: winRate(own.map((line) => line.aBb)),
        versus,
        stats: tendencies(own),
        cli: row.kind === 'cli' ? cliMetrics(own) : null,
      });
    }
  }
  return { meta, groups };
}

// ---- text

const f = (value: number, digits = 0) => value.toFixed(digits);
const pct = (value: number) => `${f(value * 100, 1)}%`;
const win = (summary: WinRateSummary) => `${f(summary.bbPer100)} ± ${f(summary.ci95)}`;
const pcts = (p: Percentiles) => `p50 ${f(p.p50 / 1000, 1)} s · p95 ${f(p.p95 / 1000, 1)} s · max ${f(p.max / 1000, 1)} s`;
const agree = (a: Agreement) => `${pct(a.matchedShare)} [${pct(a.ci95[0])}, ${pct(a.ci95[1])}] (matched ${a.matched}, close ${a.close}, off ${a.off})`;

export function formatReport(report: Report): string {
  const { meta } = report;
  const out = [
    `Run ${meta.runId} (${meta.status}) · claude ${meta.claudeVersion ?? 'n/a'} · effort ${meta.effort} · prompt ${meta.promptVersion} sha256 ${meta.promptSha256.slice(0, 12)}`,
    `Seed: ${meta.seed ?? 'withheld until the run ends'}`,
  ];
  for (const opponent of [...new Set(report.groups.map((group) => group.opponent))]) {
    out.push('', `== vs ${opponent} ==`, 'row · deals · bb/100 ± 95% CI · vs tag · vs fish (same deals) · VPIP/PFR/aggr/fold-to-bet');
    for (const group of report.groups.filter((candidate) => candidate.opponent === opponent)) {
      const paired = PAIRED_BASELINES.map((baseline) => (group.versus[baseline] ? win(group.versus[baseline]!) : '-')).join(' · ');
      const stats = group.stats ? [group.stats.vpip, group.stats.pfr, group.stats.aggression, group.stats.foldToBet].map(pct).join('/') : '-';
      out.push(`${group.row} · ${group.deals} · ${win(group.bbPer100)} · ${paired} · ${stats}`);
    }
    for (const group of report.groups.filter((candidate) => candidate.opponent === opponent && candidate.cli)) {
      const cli = group.cli!;
      out.push(
        '',
        `${group.row} vs ${opponent}${cli.contaminated ? '  CONTAMINATED (fallbacks over 2%)' : ''}`,
        `  decisions ${cli.decisions} · fallbacks ${pct(cli.fallbackRate)} ${JSON.stringify(cli.fallbackReasons)} · choice validity ${pct(cli.choiceValidity)} · full validity ${pct(cli.fullValidity)}`,
        `  wall ${pcts(cli.wallMs)} · api ${pcts(cli.apiMs)} · ttft ${pcts(cli.ttftMs)}`,
        `  turns mean ${f(cli.turns.mean, 2)} max ${cli.turns.max} · tokens/decision in ${f(cli.tokensPerDecision.input)} cache-read ${f(cli.tokensPerDecision.cacheRead)} cache-write ${f(cli.tokensPerDecision.cacheCreation)} out ${f(cli.tokensPerDecision.output)} (thinking ${f(cli.tokensPerDecision.thinking)}) · list cost $${f(cli.notionalUsd, 2)} (not billed)`,
        `  agreement with TAG advice: all ${agree(cli.agreement.all)}`,
        `    preflop ${agree(cli.agreement.preflop)}`,
        `    postflop ${agree(cli.agreement.postflop)}`,
        `  price blunders ${cli.priceBlunders.count} of ${cli.priceBlunders.ofDecisionsFacingABet} decisions facing a bet (${pct(cli.priceBlunders.rate)}) · models ${cli.models.join(', ') || 'n/a'}`,
      );
    }
  }
  return out.join('\n');
}
