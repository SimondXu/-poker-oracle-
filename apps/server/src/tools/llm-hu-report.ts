import { readFileSync } from 'node:fs';

import type { BotPlayerStats, CoachVerdict } from '@aipoker/shared';

import type { LoggedAction } from './duplicate-hu-async.ts';
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
  /** What both players did in each half, in order, for matching decisions to responses. Runs before v1 lack it. */
  hands?: Array<{ half: 1 | 2; actions: LoggedAction[] }>;
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
  /** The system prompts the CLI rows were played with: version, run label and sha256. */
  prompts: Array<{ prompt: string; label: string; persona: string; sha256: string }>;
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

/** How the bot used its good and its weak hands when nobody had bet yet (`bot-eval.md`, prompt v1 gates). */
export interface DecisionMetrics {
  /** River, nothing to call, equity above 50%, by equity bucket: how often it moved all-in. */
  riverValue: {
    spots: number;
    buckets: Array<{ from: number; to: number; spots: number; allIn: number; allInShare: number | null }>;
    /**
     * Chips left on the table against a player who never folds, in bb: (2e - 1) x (all-in minus the bet it made).
     * Exact against a never-folding opponent only; against anyone else it is the model's number, not a result.
     */
    valueLeftBb: number;
  };
  /** Flop and turn, nothing to call, equity of 62% or more: how big it bet. */
  flopTurnValue: { spots: number; bets: number; atLeastPot: number; medianPotShare: number | null };
  /** After the flop, nothing to call, equity under 35%: how often it bet. */
  bluff: { spots: number; bets: number; share: number | null };
}

/** What prompt v1 showed (`trace.exploit`) against what the model did and what the opponent did next. */
export interface ExploitMetrics {
  /** Decisions that carried v1's numbers. */
  decisions: number;
  /** River, nothing to call: the model took the option with the highest estimated gain over checking (check counts as 0). */
  riverArgmax: { spots: number; agree: number; allInBest: number; allInTaken: number; gainLeftBb: number };
  /** Weak hands (equity under 35%, nothing to call after the flop) by how far the best size's fold estimate cleared its price. */
  bluffBins: Array<{ label: string; spots: number; bets: number; betShare: number | null }>;
  /** Estimated fold of the bet it made against whether the opponent folded; bets whose answer is on record only. */
  foldCalibration: { bets: number; brier: number | null; bins: Array<{ from: number; to: number; bets: number; predicted: number | null; realised: number | null }> };
  /** Reads shown, by label (decisions), and in how many matches one appeared and at what deal on median. */
  reads: { byLabel: Record<string, number>; matchesWithRead: number; matches: number; medianFirstDeal: number | null };
}

const RIVER_BUCKETS: Array<[number, number]> = [[0.5, 0.65], [0.65, 0.8], [0.8, 1.01]];
const median = (values: number[]): number | null => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length === 0 ? null : sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
};

/** The metrics above over decisions the model made (fallbacks excluded). */
export function decisionMetrics(traces: readonly CliDecisionTrace[]): DecisionMetrics {
  const llm = traces.filter((trace) => trace.decision.source === 'llm' && trace.advice.equity !== null);
  const unbet = llm.filter((trace) => trace.phase !== 'preflop' && trace.menu.some((option) => option.kind === 'check'));
  const chosenOf = (trace: CliDecisionTrace) => trace.menu.find((option) => option.id === trace.decision.choice);
  const isBet = (trace: CliDecisionTrace) => trace.decision.kind === 'bet' || trace.decision.kind === 'all_in';

  const river = unbet.filter((trace) => trace.phase === 'river' && trace.advice.equity! > 0.5);
  let valueLeftBb = 0;
  const buckets = RIVER_BUCKETS.map(([from, to]) => {
    const spots = river.filter((trace) => trace.advice.equity! >= from && trace.advice.equity! < to);
    return { from, to: Math.min(to, 1), spots: spots.length, allIn: spots.filter((trace) => trace.decision.kind === 'all_in').length, allInShare: null as number | null };
  });
  for (const trace of river) {
    const allIn = trace.menu.find((option) => option.kind === 'all_in');
    const chosen = chosenOf(trace);
    if (allIn && chosen) {
      valueLeftBb += (2 * trace.advice.equity! - 1) * (allIn.toBb! - (chosen.kind === 'check' ? 0 : chosen.toBb!));
    }
  }
  buckets.forEach((bucket) => (bucket.allInShare = bucket.spots === 0 ? null : bucket.allIn / bucket.spots));

  const flopTurn = unbet.filter((trace) => trace.phase !== 'river' && trace.advice.equity! >= 0.62);
  const bets = flopTurn.filter(isBet);
  const shares = bets.flatMap((trace) => (chosenOf(trace)?.potShare === null || chosenOf(trace) === undefined ? [] : [chosenOf(trace)!.potShare!]));
  const weak = unbet.filter((trace) => trace.advice.equity! < 0.35);
  return {
    riverValue: { spots: river.length, buckets, valueLeftBb },
    flopTurnValue: { spots: flopTurn.length, bets: bets.length, atLeastPot: shares.filter((share) => share >= 0.995).length, medianPotShare: median(shares) },
    bluff: { spots: weak.length, bets: weak.filter(isBet).length, share: weak.length === 0 ? null : weak.filter(isBet).length / weak.length },
  };
}

const BLUFF_BINS: Array<{ label: string; test: (margin: number) => boolean }> = [
  { label: 'margin under 0', test: (margin) => margin < 0 },
  { label: 'margin 0 to 10 points', test: (margin) => margin >= 0 && margin < 0.1 },
  { label: 'margin 10 points or more', test: (margin) => margin >= 0.1 },
];

/** Needs v1 traces; null when none carried the numbers. */
export function exploitMetrics(lines: readonly DealLine[]): ExploitMetrics | null {
  const entries = lines.flatMap((line) => line.traces.map((entry) => ({ line, half: entry.half, trace: entry.trace })));
  const shown = entries.filter(({ trace }) => trace.decision.source === 'llm' && (trace.exploit?.estimates.length ?? 0) > 0);
  if (entries.every(({ trace }) => !trace.exploit)) {
    return null;
  }

  const unbet = (trace: CliDecisionTrace) => trace.phase !== 'preflop' && trace.menu.some((option) => option.kind === 'check');
  const river = shown.filter(({ trace }) => trace.phase === 'river' && unbet(trace));
  let agree = 0;
  let allInBest = 0;
  let allInTaken = 0;
  let gainLeftBb = 0;
  for (const { trace } of river) {
    const gains = trace.exploit!.estimates.map((estimate) => ({ option: estimate.option, gain: estimate.gainBb ?? 0 }));
    const check = trace.menu.find((option) => option.kind === 'check')!;
    const best = [{ option: check.id as string, gain: 0 }, ...gains].reduce((top, candidate) => (candidate.gain > top.gain ? candidate : top));
    const chosen = trace.decision.choice;
    agree += chosen === best.option ? 1 : 0;
    const allIn = trace.menu.find((option) => option.kind === 'all_in')?.id;
    allInBest += allIn !== undefined && best.option === allIn ? 1 : 0;
    allInTaken += trace.decision.kind === 'all_in' ? 1 : 0;
    gainLeftBb += best.gain - (chosen === check.id ? 0 : (gains.find((candidate) => candidate.option === chosen)?.gain ?? 0));
  }

  const weak = shown.filter(({ trace }) => unbet(trace) && trace.advice.equity !== null && trace.advice.equity < 0.35);
  const bluffBins = BLUFF_BINS.map(({ label, test }) => {
    const inBin = weak.filter(({ trace }) => test(Math.max(...trace.exploit!.estimates.map((estimate) => estimate.fold - estimate.bluffNeeds))));
    const bets = inBin.filter(({ trace }) => trace.decision.kind === 'bet' || trace.decision.kind === 'all_in').length;
    return { label, spots: inBin.length, bets, betShare: inBin.length === 0 ? null : bets / inBin.length };
  });

  // The opponent's answer to the model's own bet: the next action of the hand, if it is theirs on the same street.
  const answered: Array<{ fold: number; folded: boolean }> = [];
  for (const { line, half, trace } of shown) {
    const estimate = trace.exploit!.estimates.find((candidate) => candidate.option === trace.decision.choice);
    const actions = line.hands?.find((hand) => hand.half === half)?.actions;
    const mine = actions?.[trace.actionIndex];
    const reply = actions?.[trace.actionIndex + 1];
    if (estimate && mine && reply && reply.player !== mine.player && reply.phase === mine.phase) {
      answered.push({ fold: estimate.fold, folded: reply.type === 'fold' });
    }
  }
  const calibrationBins = [0, 0.2, 0.4, 0.6, 0.8].map((from) => {
    const inBin = answered.filter((bet) => bet.fold >= from && bet.fold < (from === 0.8 ? 1.01 : from + 0.2));
    return {
      from,
      to: Math.min(1, from + 0.2),
      bets: inBin.length,
      predicted: inBin.length === 0 ? null : mean(inBin.map((bet) => bet.fold)),
      realised: inBin.length === 0 ? null : mean(inBin.map((bet) => (bet.folded ? 1 : 0))),
    };
  });

  const byLabel: Record<string, number> = {};
  for (const { trace } of entries) {
    trace.exploit?.reads.forEach((label) => (byLabel[label] = (byLabel[label] ?? 0) + 1));
  }
  const matches = new Map<string, number | null>();
  for (const { line, trace } of entries) {
    if (!matches.has(line.key)) {
      matches.set(line.key, null);
    }
    if ((trace.exploit?.reads.length ?? 0) > 0) {
      matches.set(line.key, Math.min(matches.get(line.key) ?? Infinity, line.deal));
    }
  }
  const firsts = [...matches.values()].filter((deal): deal is number => deal !== null);
  return {
    decisions: shown.length,
    riverArgmax: { spots: river.length, agree, allInBest, allInTaken, gainLeftBb },
    bluffBins,
    foldCalibration: { bets: answered.length, brier: answered.length === 0 ? null : mean(answered.map((bet) => (bet.fold - (bet.folded ? 1 : 0)) ** 2)), bins: calibrationBins },
    reads: { byLabel, matchesWithRead: firsts.length, matches: matches.size, medianFirstDeal: median(firsts) },
  };
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
  /** How it played its good and its weak hands; see `DecisionMetrics`. */
  play: DecisionMetrics;
  /** What prompt v1 showed and how the model used it; null for v0 rows. */
  exploit: ExploitMetrics | null;
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
    play: decisionMetrics(traces),
    exploit: exploitMetrics(lines),
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

const share = (part: number, whole: number) => (whole === 0 ? '-' : `${part}/${whole}`);

export function formatPlay(play: DecisionMetrics): string[] {
  return [
    `  river, nothing to call, equity over 50%: ${play.riverValue.spots} spots; all-in ${play.riverValue.buckets.map((bucket) => `${share(bucket.allIn, bucket.spots)} at ${f(bucket.from * 100)}-${f(bucket.to * 100)}%`).join(' · ')}; model value left vs an all-in ${f(play.riverValue.valueLeftBb)} bb (exact only against a never-folding opponent)`,
    `  flop/turn, nothing to call, equity 62%+: ${play.flopTurnValue.spots} spots, bet ${play.flopTurnValue.bets}, pot or more ${play.flopTurnValue.atLeastPot}, median size ${play.flopTurnValue.medianPotShare === null ? '-' : `${f(play.flopTurnValue.medianPotShare * 100)}% of the pot`}`,
    `  after the flop, nothing to call, equity under 35%: bet ${share(play.bluff.bets, play.bluff.spots)}`,
  ];
}

export function formatExploit(exploit: ExploitMetrics): string[] {
  const ratio = (part: number, whole: number) => (whole === 0 ? '-' : `${part}/${whole} (${f((part / whole) * 100)}%)`);
  const { riverArgmax: river, foldCalibration: calibration, reads } = exploit;
  return [
    `  v1 numbers shown on ${exploit.decisions} decisions · reads ${JSON.stringify(reads.byLabel)} · a read appeared in ${reads.matchesWithRead} of ${reads.matches} matches, median first at deal ${reads.medianFirstDeal ?? '-'}`,
    `  river EV-argmax: took the best-gain option ${ratio(river.agree, river.spots)} · all-in was best ${river.allInBest}, taken ${river.allInTaken} · model gain left ${f(river.gainLeftBb)} bb`,
    `  weak hands, bet rate by margin (best fold estimate minus what a bluff needs): ${exploit.bluffBins.map((bin) => `${bin.label} ${ratio(bin.bets, bin.spots)}`).join(' · ')}`,
    `  fold estimates: Brier ${calibration.brier === null ? '-' : f(calibration.brier, 3)} on ${calibration.bets} answered bets · ${calibration.bins.filter((bin) => bin.bets > 0).map((bin) => `${f(bin.from * 100)}-${f(bin.to * 100)}%: said ${f((bin.predicted ?? 0) * 100)}% got ${f((bin.realised ?? 0) * 100)}% (${bin.bets})`).join(' · ') || 'none'}`,
  ];
}

export function formatReport(report: Report): string {
  const { meta } = report;
  const out = [
    `Run ${meta.runId} (${meta.status}) · claude ${meta.claudeVersion ?? 'n/a'} · effort ${meta.effort} · prompts ${meta.prompts.map((prompt) => `${prompt.prompt} (${prompt.label}) persona ${prompt.persona} sha256 ${prompt.sha256.slice(0, 12)}`).join(', ')}`,
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
        ...formatPlay(cli.play),
        ...(cli.exploit ? formatExploit(cli.exploit) : []),
      );
    }
  }
  return out.join('\n');
}
