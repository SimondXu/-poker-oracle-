import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyAction, getValidActions, initializeHand, type PlayerActionInput, type ValidActions } from '@aipoker/game-engine';
import type { BotAction, BotDecisionPhase, BotPersonality, CoachReason, CoachReviewRecord, CoachVerdict } from '@aipoker/shared';
import { chooseBotAction } from '@aipoker/strategy-engine';

import { captureCoachDecision, takeHandReviews } from '../game-loop/coach-review.ts';
import {
  buildBotDecisionContext,
  getBotPreflopFoldStreak,
  isFirstPreflopDecisionForPlayer,
  recordFinishedHandStats,
  trackBotPreflopEntryDecision,
} from '../game-loop/bot-support.ts';
import { selectEmergencyBotActionInput } from '../game-loop/realtime-bot-fallback.ts';
import { syncRoomPlayersFromHand } from '../rooms/room-store.ts';
import type { RuntimeRoom } from '../rooms/types.ts';
import { POLICIES } from './eval-policies.ts';
import { mixSeed, mulberry32 } from './eval-utils.ts';

/**
 * Eval samples for the coach commentary (Docs/game-design/coach-commentary.md, "Evals"): a seeded
 * six-max table where the hero's seat is a human's, played by a policy drawn per hand. Decisions are
 * recorded through the production capture and review, so each sample is a production record. Writes
 * every decision as JSONL, then a dev and a golden set stratified street × verdict from disjoint
 * hands, and checks that no line of any file holds a card the hero could not see.
 *
 *   pnpm --filter @aipoker/server coach:samples [--seed N] [--hands N] [--out DIR]
 */

const DEFAULT_SEED = 20261013;
const DEFAULT_HANDS = 1_500;
const DEFAULT_OUT = '.eval/coach-samples';
const ROOM_ID = 'SAMPLE';
const HERO_ID = 'hero';
const BIG_BLIND = 20;
const STACK = BIG_BLIND * 100;
/**
 * The rule bots of the training table, with one seat a calling station: the rule bots all fold to
 * bets often enough that the policy never reads anyone as sticky, so only a player who calls
 * everything, as some humans do, gives the hero's advice its sticky_opponent spots.
 */
const OPPONENTS: ReadonlyArray<{ id: string; play: BotPersonality | 'station' }> = [
  { id: 'fish-1', play: 'fish' },
  { id: 'tag-1', play: 'tag' },
  { id: 'lag-1', play: 'lag' },
  { id: 'station-1', play: 'station' },
  { id: 'lag-2', play: 'lag' },
];

export type HeroPolicy = 'tag' | 'fish' | 'lag' | 'station' | 'random';
const HERO_MIX: ReadonlyArray<readonly [HeroPolicy, number]> = [
  ['tag', 0.4],
  ['fish', 0.15],
  ['lag', 0.15],
  ['station', 0.1],
  ['random', 0.2],
];
/**
 * Share of hero decisions left to run out the clock, played as the server's timeout plays them.
 * The mix alone never times out, and the golden set needs timeouts.
 */
const TIMEOUT_RATE = 0.03;

export interface CoachSample {
  /** `${handNumber}:${actionIndex}` */
  id: string;
  handNumber: number;
  heroPolicy: HeroPolicy;
  decision: CoachReviewRecord;
}

/** The cards the hero could see at a decision, from the engine's hand rather than the record. */
export type VisibleCards = Map<string, ReadonlySet<string>>;

const BOARD_SIZE: Record<BotDecisionPhase, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

export function generateCoachSamples(options: { seed: number; hands: number }): { samples: CoachSample[]; visible: VisibleCards } {
  const room = createRoom();
  const samples: CoachSample[] = [];
  const visible: VisibleCards = new Map();

  for (let handIndex = 0; handIndex < options.hands; handIndex += 1) {
    const rng = mulberry32(mixSeed(options.seed, handIndex));
    const heroPolicy = drawHeroPolicy(rng());
    for (const player of room.players.values()) {
      player.stack = STACK;
    }
    const initialized = initializeHand({
      players: [...room.players.values()].map(({ id, seatIndex, stack }) => ({ id, seatIndex, stack })),
      buttonMarkerSeat: handIndex % room.players.size,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      rng,
    });
    if (!initialized.ok) {
      throw new Error(`hand ${handIndex + 1} failed to start: ${initialized.error}`);
    }
    room.hand = initialized.value;
    room.handNumber += 1;
    room.stateVersion += 1;

    while (room.hand.currentActorSeat !== null) {
      const hand = room.hand;
      const actor = [...room.players.values()].find((player) => player.seatIndex === hand.currentActorSeat)!;
      const context = buildBotDecisionContext(room, actor.id);
      if (!context) {
        throw new Error(`no decision context for ${actor.id} in hand ${room.handNumber}`);
      }

      let input: PlayerActionInput;
      let source: 'player' | 'timeout' = 'player';
      if (actor.isBot) {
        const isFirstPreflopDecision = context.phase === 'preflop' && isFirstPreflopDecisionForPlayer(hand, actor.id);
        const play = OPPONENTS.find((opponent) => opponent.id === actor.id)!.play;
        input = toActionInput(actor.id, play === 'station' ? POLICIES.station(context, rng) : chooseBotAction(context, play, rng, {
          preflopConsecutiveFolds: getBotPreflopFoldStreak(room, actor.id),
          isFirstPreflopDecision,
        }));
      } else if (rng() < TIMEOUT_RATE) {
        input = selectEmergencyBotActionInput(actor.id, getValidActions(hand, actor.id));
        source = 'timeout';
      } else {
        input = heroPolicy === 'random'
          ? randomLegalAction(actor.id, getValidActions(hand, actor.id), rng)
          : toActionInput(actor.id, heroPolicy === 'station' ? POLICIES.station(context, rng) : chooseBotAction(context, heroPolicy, rng));
      }

      const applied = applyAction(hand, input, { timestamp: hand.actions.length + 1 });
      if (!applied.ok) {
        throw new Error(`${actor.id}'s ${input.type} rejected in hand ${room.handNumber}: ${applied.error}`);
      }
      // As the server does: capture from the state before the action, record once it is applied.
      const recordDecision = actor.isBot ? null : captureCoachDecision(room, input, source);
      if (actor.isBot) {
        trackBotPreflopEntryDecision(room, hand, actor.id, input.type);
      }
      room.hand = applied.value;
      // The kept advice is keyed by stateVersion, so every action must move it on, as the server does.
      room.stateVersion += 1;
      syncRoomPlayersFromHand(room);
      recordDecision?.();
    }

    recordFinishedHandStats(room);
    const heroHand = room.hand.players.find((player) => player.id === HERO_ID)!;
    for (const review of takeHandReviews(room)) {
      for (const decision of review.decisions) {
        const id = `${review.handNumber}:${decision.advice.actionIndex}`;
        samples.push({ id, handNumber: review.handNumber, heroPolicy, decision });
        visible.set(id, new Set([...heroHand.holeCards, ...room.hand.communityCards.slice(0, BOARD_SIZE[decision.street])]));
      }
    }
  }
  return { samples, visible };
}

function createRoom(): RuntimeRoom {
  const seats = [{ id: HERO_ID, play: null }, ...OPPONENTS];
  return {
    id: ROOM_ID,
    stateVersion: 0,
    handNumber: 0,
    smallBlind: BIG_BLIND / 2,
    bigBlind: BIG_BLIND,
    actionTimeoutMs: 0,
    players: new Map(seats.map(({ id, play }, seatIndex) => [id, {
      id,
      name: id,
      seatIndex,
      stack: STACK,
      isBot: play !== null,
      ...(play && play !== 'station' ? { botConfig: { kind: 'rule' as const, personality: play } } : {}),
    }])),
    readyPlayerIds: new Set(seats.map(({ id }) => id)),
    pendingDisconnectPlayerIds: new Set(),
    spectatingPlayerIds: new Set(),
    hand: null,
    lastActionSeqByPlayer: new Map(),
    lastBroadcastActionCount: 0,
    lastButtonMarkerSeat: null,
    hostPlayerId: HERO_ID,
    playerStats: new Map(),
    coachAdvice: new Map(),
    coachRecords: new Map(),
    coachSessions: new Map(),
    coachReviews: new Map(),
  };
}

function drawHeroPolicy(roll: number): HeroPolicy {
  let cumulative = 0;
  for (const [policy, share] of HERO_MIX) {
    cumulative += share;
    if (roll < cumulative) {
      return policy;
    }
  }
  return HERO_MIX[HERO_MIX.length - 1]![0];
}

/**
 * One of the engine's legal actions, each type equally likely; a raise to a uniform total in its
 * window, which is only the whole stack when that is short of a full raise.
 */
function randomLegalAction(playerId: string, valid: ValidActions, rng: () => number): PlayerActionInput {
  const span = Math.max(0, valid.maxRaiseTo - valid.minRaiseTo);
  const raiseTo = Math.min(valid.maxRaiseTo, valid.minRaiseTo + Math.floor(rng() * (span + 1)));
  const actions: PlayerActionInput[] = [
    ...(valid.canFold ? [{ playerId, type: 'fold' as const }] : []),
    ...(valid.canCheck ? [{ playerId, type: 'check' as const }] : []),
    ...(valid.canCall ? [{ playerId, type: 'call' as const }] : []),
    ...(valid.canRaise ? [{ playerId, type: 'raise_to' as const, amount: raiseTo }] : []),
    ...(valid.canAllIn ? [{ playerId, type: 'all_in' as const }] : []),
  ];
  return actions[Math.floor(rng() * actions.length)]!;
}

function toActionInput(playerId: string, action: BotAction): PlayerActionInput {
  return action.type === 'raise_to' ? { playerId, type: 'raise_to', amount: action.amount } : { playerId, type: action.type };
}

// ---- Split and stratification.

const STREETS: readonly BotDecisionPhase[] = ['preflop', 'flop', 'turn', 'river'];
const VERDICTS: readonly CoachVerdict[] = ['matched', 'close', 'off'];
const SET_SIZE = 150;
const SPLIT_SALT = 0x5eed;

interface Target {
  label: string;
  min: number;
  matches: (sample: CoachSample) => boolean;
}

function hasReason(sample: CoachSample, codes: ReadonlyArray<CoachReason['code']>): boolean {
  const { advice } = sample.decision;
  return [...advice.reasons, ...advice.options.flatMap((option) => option.reasons)].some((reason) => codes.includes(reason.code));
}

/** Both sets are stratified street × verdict; the golden set also holds these minimums, rarest first (coach-commentary.md). */
const GOLDEN_TARGETS: readonly Target[] = [
  { label: 'timeout', min: 10, matches: (sample) => sample.decision.heroAction.source === 'timeout' },
  { label: 'sticky_opponent', min: 10, matches: (sample) => hasReason(sample, ['sticky_opponent']) },
  { label: 'jam', min: 10, matches: (sample) => hasReason(sample, ['jam']) },
  { label: 'price_*', min: 10, matches: (sample) => hasReason(sample, ['price_ok', 'price_short']) },
  { label: 'position_range', min: 10, matches: (sample) => hasReason(sample, ['position_range']) },
  { label: 'unstable', min: 20, matches: (sample) => !sample.decision.advice.stable },
  { label: 'multiway', min: 30, matches: (sample) => sample.decision.advice.opponents >= 2 },
];
const CELL_TARGETS: readonly Target[] = STREETS.flatMap((street) => VERDICTS.map((verdict) => ({
  label: `${street} × ${verdict}`,
  min: 10,
  matches: (sample: CoachSample) => sample.decision.street === street && sample.decision.verdict === verdict,
})));

/**
 * The golden set, then the dev set from the hands the golden set left, so no hand feeds both. Each
 * takes samples in seeded order until its targets are met, then fills to SET_SIZE across the
 * street × verdict cells in turn; the golden set fills from at most half of each cell, so the rare
 * cells have enough left for the dev set.
 */
export function splitSamples(samples: readonly CoachSample[], seed: number): { dev: CoachSample[]; golden: CoachSample[] } {
  const shuffled = [...samples];
  const rng = mulberry32(mixSeed(seed, SPLIT_SALT));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }

  const golden = pickSet(shuffled, [...GOLDEN_TARGETS, ...CELL_TARGETS], 0.5);
  const goldenHands = new Set(golden.map((sample) => sample.handNumber));
  const dev = pickSet(shuffled.filter((sample) => !goldenHands.has(sample.handNumber)), CELL_TARGETS, 1);
  return { dev: sortById(dev), golden: sortById(golden) };
}

function pickSet(pool: readonly CoachSample[], targets: readonly Target[], cellShare: number): CoachSample[] {
  const chosen = new Set<CoachSample>();
  for (const target of targets) {
    let count = [...chosen].filter(target.matches).length;
    for (const sample of pool) {
      if (count >= target.min || chosen.size >= SET_SIZE) {
        break;
      }
      if (!chosen.has(sample) && target.matches(sample)) {
        chosen.add(sample);
        count += 1;
      }
    }
  }

  const cells = CELL_TARGETS.map((cell) => {
    const members = pool.filter(cell.matches);
    const left = Math.floor(members.length * cellShare) - members.filter((sample) => chosen.has(sample)).length;
    return members.filter((sample) => !chosen.has(sample)).slice(0, Math.max(0, left));
  });
  for (let cell = 0; chosen.size < SET_SIZE && cells.some((queue) => queue.length > 0); cell = (cell + 1) % cells.length) {
    const next = cells[cell]!.shift();
    if (next) {
      chosen.add(next);
    }
  }
  return [...chosen];
}

function sortById(samples: CoachSample[]): CoachSample[] {
  return samples.sort((a, b) => a.handNumber - b.handNumber || a.decision.advice.actionIndex - b.decision.advice.actionIndex);
}

export function stratificationTable(all: readonly CoachSample[], dev: readonly CoachSample[], golden: readonly CoachSample[]): { table: string; met: boolean } {
  const count = (samples: readonly CoachSample[], target: Target) => samples.filter(target.matches).length;
  const rows = [...GOLDEN_TARGETS, ...CELL_TARGETS].map((target) => {
    const [devCount, goldenCount] = [count(dev, target), count(golden, target)];
    const devMin = CELL_TARGETS.includes(target) ? target.min : 0;
    const met = devCount >= devMin && goldenCount >= target.min;
    return { met, cells: [target.label, devMin ? `≥ ${devMin}` : '–', `≥ ${target.min}`, count(all, target), devCount, goldenCount, met ? 'yes' : 'NO'] };
  });
  const sizes = { met: dev.length === SET_SIZE && golden.length === SET_SIZE, cells: ['size', `= ${SET_SIZE}`, `= ${SET_SIZE}`, all.length, dev.length, golden.length] };
  const table = [
    '| Target | Dev min | Golden min | All | Dev | Golden | Met |',
    '|---|---|---|---|---|---|---|',
    ...[{ ...sizes, cells: [...sizes.cells, sizes.met ? 'yes' : 'NO'] }, ...rows].map((row) => `| ${row.cells.join(' | ')} |`),
  ].join('\n');
  return { table, met: sizes.met && rows.every((row) => row.met) };
}

// ---- Card-leak check.

const CARD = /\b[2-9TJQKA][hdcs]\b/g;

/** Every card-shaped token in each line must be one the hero could see at that decision. */
export function findCardLeaks(lines: readonly string[], visible: VisibleCards): string[] {
  return lines.flatMap((line) => {
    const sample = JSON.parse(line) as CoachSample;
    const allowed = visible.get(sample.id);
    const leaked = [...line.matchAll(CARD)].map(([card]) => card).filter((card) => !allowed?.has(card));
    return leaked.length > 0 ? [`${sample.id}: ${[...new Set(leaked)].join(' ')}`] : [];
  });
}

// ---- CLI.

function parseArgs(argv: readonly string[]): { seed: number; hands: number; out: string } {
  const options = { seed: DEFAULT_SEED, hands: DEFAULT_HANDS, out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (flag === '--seed' || flag === '--hands') {
      const parsed = Number.parseInt(value ?? '', 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${flag} needs a non-negative integer`);
      }
      options[flag === '--seed' ? 'seed' : 'hands'] = parsed;
    } else if (flag === '--out' && value) {
      options.out = value;
    } else {
      throw new Error(`Unknown argument "${flag ?? ''}"; expected --seed N, --hands N, --out DIR`);
    }
  }
  return options;
}

function runCli(): void {
  const options = parseArgs(process.argv.slice(2));
  const started = performance.now();
  const { samples, visible } = generateCoachSamples(options);
  const { dev, golden } = splitSamples(samples, options.seed);

  mkdirSync(options.out, { recursive: true });
  const files = { all: samples, dev, golden };
  let leaks: string[] = [];
  console.log(`Seed ${options.seed}, ${options.hands} hands, ${samples.length} hero decisions (${((performance.now() - started) / 1000).toFixed(1)} s)\n`);
  for (const [name, set] of Object.entries(files)) {
    const path = join(options.out, `${name}-${options.seed}.jsonl`);
    writeFileSync(path, set.map((sample) => `${JSON.stringify(sample)}\n`).join(''));
    const written = readFileSync(path, 'utf8');
    leaks = [...leaks, ...findCardLeaks(written.split('\n').filter(Boolean), visible)];
    console.log(`${path}  sha256 ${createHash('sha256').update(written).digest('hex')}`);
  }

  const policies = HERO_MIX.map(([policy]) => `${policy} ${samples.filter((sample) => sample.heroPolicy === policy).length}`).join(', ');
  console.log(`\nHero decisions by policy: ${policies}\n`);
  const { table, met } = stratificationTable(samples, dev, golden);
  console.log(`${table}\n`);
  console.log(leaks.length === 0 ? 'Card-leak check: passed' : `Card-leak check: FAILED\n${leaks.join('\n')}`);
  if (!met || leaks.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli();
}
