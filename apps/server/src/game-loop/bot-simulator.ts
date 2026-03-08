import { chooseBotAction } from '@aipoker/bot-engine';
import { applyAction, initializeHand, type HandActionRecord, type HandState, type PlayerActionInput } from '@aipoker/game-engine';
import type { BotAction, BotDecisionContext, BotPersonality, BotPosition } from '@aipoker/shared';
import { fileURLToPath } from 'node:url';

import {
  buildBotDecisionContext,
  getBotPreflopFoldStreak,
  isFirstPreflopDecisionForPlayer,
  resetBotPreflopFoldStreaks,
  resolveButtonMarkerSeatForNextHand,
  trackBotPreflopEntryDecision,
} from './bot-support.ts';
import { syncRoomPlayersFromHand } from '../rooms/room-store.ts';
import type { RuntimePlayer, RuntimeRoom } from '../rooms/types.ts';

export interface BotSeatConfig {
  id: string;
  name: string;
  seatIndex: number;
  personality: BotPersonality;
}

interface MetricCounter {
  count: number;
  opportunities: number;
}

interface PlayerMetricCounters {
  handsDealt: number;
  sawFlopHands: number;
  vpip: MetricCounter;
  pfr: MetricCounter;
  threeBet: MetricCounter;
  foldToOpen: MetricCounter;
  cbet: MetricCounter;
  foldToCbet: MetricCounter;
  wentToShowdown: MetricCounter;
  wonAtShowdown: MetricCounter;
  rfiByPosition: Record<BotPosition, MetricCounter>;
}

interface TrackedHandState {
  ordinal: number;
  preflopActedPlayerIds: Set<string>;
  flopActedPlayerIds: Set<string>;
}

export interface BotStatTracker {
  players: Map<string, PlayerMetricCounters>;
  personalities: Map<string, BotPersonality>;
  nextHandOrdinal: number;
  currentHand: TrackedHandState | null;
}

interface SummaryMetric extends MetricCounter {
  rate: number;
}

interface SummaryMetrics {
  handsDealt: number;
  sawFlopHands: number;
  vpip: SummaryMetric;
  pfr: SummaryMetric;
  threeBet: SummaryMetric;
  foldToOpen: SummaryMetric;
  cbet: SummaryMetric;
  foldToCbet: SummaryMetric;
  wentToShowdown: SummaryMetric;
  wonAtShowdown: SummaryMetric;
  rfiByPosition: Record<BotPosition, SummaryMetric>;
}

export interface BotSimulationSummary {
  players: Record<string, SummaryMetrics>;
  personalities: Record<BotPersonality, SummaryMetrics>;
  table: TablePacingSummary;
}

export interface BotSimulationSegment {
  label: string;
  hands: number;
  stackBb: number;
}

export interface TablePacingSummary {
  hands: number;
  avgVoluntaryEntrants: number;
  sawFlopRate: number;
  walkRate: number;
  humanOpenOpportunities: number;
  humanOpenWalkRate: number;
  maxBotPreflopFoldStreak: number;
}

export interface SimulationSeatDescriptor {
  id: string;
  name: string;
  seatIndex: number;
  actor: 'bot' | 'benchmark_human';
  personality?: BotPersonality;
  benchmarkStyle?: 'training_tag';
}

export interface TrainingTableSimulationReport {
  seats: SimulationSeatDescriptor[];
  segments: Array<{
    label: string;
    hands: number;
    stackBb: number;
    summary: BotSimulationSummary;
  }>;
  overall: BotSimulationSummary;
}

export interface BotSimulationReport {
  hands: number;
  seed: number;
  seats: BotSeatConfig[];
  segments: Array<{
    label: string;
    hands: number;
    stackBb: number;
    summary: BotSimulationSummary;
  }>;
  overall: BotSimulationSummary;
  trainingTable?: TrainingTableSimulationReport;
}

export interface SimulateBotStatsOptions {
  hands?: number;
  seed?: number;
  smallBlind?: number;
  bigBlind?: number;
  seats?: BotSeatConfig[];
  segments?: BotSimulationSegment[];
  includeTrainingTable?: boolean;
}

type SimulationSeatConfig = SimulationSeatDescriptor;

interface TablePacingCounters {
  hands: number;
  handsSawFlop: number;
  handsEndedPreflop: number;
  totalVoluntaryEntrants: number;
  humanOpenOpportunities: number;
  humanOpenWalks: number;
  maxBotPreflopFoldStreak: number;
}

const POSITIONS: BotPosition[] = ['utg', 'hj', 'co', 'btn', 'sb', 'bb'];
const DEFAULT_SEED = 20260307;
const DEFAULT_SEATS: BotSeatConfig[] = [
  { id: 'fish-1', name: 'Fish 1', seatIndex: 0, personality: 'fish' },
  { id: 'tag-1', name: 'Tag 1', seatIndex: 1, personality: 'tag' },
  { id: 'lag-1', name: 'Lag 1', seatIndex: 2, personality: 'lag' },
  { id: 'fish-2', name: 'Fish 2', seatIndex: 3, personality: 'fish' },
  { id: 'tag-2', name: 'Tag 2', seatIndex: 4, personality: 'tag' },
  { id: 'lag-2', name: 'Lag 2', seatIndex: 5, personality: 'lag' },
];
const DEFAULT_TRAINING_TABLE_SEATS: SimulationSeatConfig[] = [
  { id: 'hero-benchmark', name: 'Hero', seatIndex: 0, actor: 'benchmark_human', benchmarkStyle: 'training_tag' },
  { id: 'fish-1', name: 'Fish 1', seatIndex: 1, actor: 'bot', personality: 'fish' },
  { id: 'tag-1', name: 'Tag 1', seatIndex: 2, actor: 'bot', personality: 'tag' },
  { id: 'lag-1', name: 'Lag 1', seatIndex: 3, actor: 'bot', personality: 'lag' },
  { id: 'fish-2', name: 'Fish 2', seatIndex: 4, actor: 'bot', personality: 'fish' },
  { id: 'lag-2', name: 'Lag 2', seatIndex: 5, actor: 'bot', personality: 'lag' },
];

function zeroMetric(): MetricCounter {
  return { count: 0, opportunities: 0 };
}

function createPlayerMetricCounters(): PlayerMetricCounters {
  return {
    handsDealt: 0,
    sawFlopHands: 0,
    vpip: zeroMetric(),
    pfr: zeroMetric(),
    threeBet: zeroMetric(),
    foldToOpen: zeroMetric(),
    cbet: zeroMetric(),
    foldToCbet: zeroMetric(),
    wentToShowdown: zeroMetric(),
    wonAtShowdown: zeroMetric(),
    rfiByPosition: {
      utg: zeroMetric(),
      hj: zeroMetric(),
      co: zeroMetric(),
      btn: zeroMetric(),
      sb: zeroMetric(),
      bb: zeroMetric(),
    },
  };
}

function createTablePacingCounters(): TablePacingCounters {
  return {
    hands: 0,
    handsSawFlop: 0,
    handsEndedPreflop: 0,
    totalVoluntaryEntrants: 0,
    humanOpenOpportunities: 0,
    humanOpenWalks: 0,
    maxBotPreflopFoldStreak: 0,
  };
}

export function createBotStatTracker(players: ReadonlyArray<{ id: string; personality: BotPersonality }>): BotStatTracker {
  return {
    players: new Map(players.map((player) => [player.id, createPlayerMetricCounters()])),
    personalities: new Map(players.map((player) => [player.id, player.personality])),
    nextHandOrdinal: 1,
    currentHand: null,
  };
}

export function startTrackedHand(tracker: BotStatTracker, hand: HandState): void {
  tracker.currentHand = {
    ordinal: tracker.nextHandOrdinal,
    preflopActedPlayerIds: new Set(),
    flopActedPlayerIds: new Set(),
  };
  tracker.nextHandOrdinal += 1;

  for (const player of hand.players) {
    const metrics = tracker.players.get(player.id);
    if (!metrics) {
      continue;
    }
    metrics.handsDealt += 1;
    metrics.vpip.opportunities += 1;
    metrics.pfr.opportunities += 1;
  }
}

export function recordBotDecisionStats(
  tracker: BotStatTracker,
  input: {
    playerId: string;
    hand: HandState;
    context: BotDecisionContext;
    action: Pick<BotAction, 'type'>;
  }
): void {
  const metrics = tracker.players.get(input.playerId);
  if (!metrics || !tracker.currentHand) {
    return;
  }

  if (input.context.phase === 'preflop') {
    if (tracker.currentHand.preflopActedPlayerIds.has(input.playerId)) {
      return;
    }
    tracker.currentHand.preflopActedPlayerIds.add(input.playerId);
    recordPreflopDecisionStats(metrics, input.context, input.action);
    return;
  }

  if (input.context.phase === 'flop') {
    if (tracker.currentHand.flopActedPlayerIds.has(input.playerId)) {
      return;
    }
    tracker.currentHand.flopActedPlayerIds.add(input.playerId);
    recordFlopDecisionStats(metrics, input.hand, input.playerId, input.context, input.action);
  }
}

export function recordBotHandResultStats(tracker: BotStatTracker, hand: HandState): void {
  const paidPlayerIds = new Set(hand.payouts.map((payout) => payout.playerId));
  const sawFlop = hand.communityCards.length >= 3;
  const reachedShowdown = hand.communityCards.length === 5;

  for (const player of hand.players) {
    const metrics = tracker.players.get(player.id);
    if (!metrics) {
      continue;
    }

    if (sawFlop && !didPlayerFoldInPhase(hand, player.id, 'betting_preflop')) {
      metrics.sawFlopHands += 1;
      metrics.wentToShowdown.opportunities += 1;
    }

    if (reachedShowdown && player.status !== 'folded') {
      metrics.wentToShowdown.count += 1;
      metrics.wonAtShowdown.opportunities += 1;
      if (paidPlayerIds.has(player.id)) {
        metrics.wonAtShowdown.count += 1;
      }
    }
  }

  tracker.currentHand = null;
}

function didPlayerFoldInPhase(hand: HandState, playerId: string, phase: HandActionRecord['phase']): boolean {
  return hand.actions.some((action) => action.playerId === playerId && action.phase === phase && action.type === 'fold');
}

function recordPreflopDecisionStats(
  metrics: PlayerMetricCounters,
  context: BotDecisionContext,
  action: Pick<BotAction, 'type'>
): void {
  const isVoluntaryAction = action.type === 'call' || action.type === 'raise_to' || action.type === 'all_in';
  const isAggressiveAction = action.type === 'raise_to' || action.type === 'all_in';

  if (isVoluntaryAction) {
    metrics.vpip.count += 1;
  }
  if (isAggressiveAction) {
    metrics.pfr.count += 1;
  }

  if (context.bettingState === 'unopened') {
    metrics.rfiByPosition[context.position].opportunities += 1;
    if (isAggressiveAction) {
      metrics.rfiByPosition[context.position].count += 1;
    }
  }

  if ((context.bettingState === 'facing_open' || context.bettingState === 'facing_raise') && context.callAmount > 0) {
    metrics.foldToOpen.opportunities += 1;
    metrics.threeBet.opportunities += 1;
    if (action.type === 'fold') {
      metrics.foldToOpen.count += 1;
    }
    if (isAggressiveAction) {
      metrics.threeBet.count += 1;
    }
  }
}

function recordFlopDecisionStats(
  metrics: PlayerMetricCounters,
  hand: HandState,
  playerId: string,
  context: BotDecisionContext,
  action: Pick<BotAction, 'type'>
): void {
  const isAggressiveAction = action.type === 'raise_to' || action.type === 'all_in';

  if (context.bettingState === 'unopened' && context.isPreflopAggressor && context.canRaise) {
    metrics.cbet.opportunities += 1;
    if (isAggressiveAction) {
      metrics.cbet.count += 1;
    }
  }

  if (
    context.bettingState === 'facing_open'
    && context.canCall
    && !context.isPreflopAggressor
    && isFacingFlopCbet(hand, playerId)
  ) {
    metrics.foldToCbet.opportunities += 1;
    if (action.type === 'fold') {
      metrics.foldToCbet.count += 1;
    }
  }
}

function getAggressiveActionsForPhase(hand: HandState, phase: HandActionRecord['phase']): HandActionRecord[] {
  let currentMax = phase === 'betting_preflop' ? hand.blinds.bigBlind : 0;
  const aggressiveActions: HandActionRecord[] = [];

  for (const action of hand.actions) {
    if (action.phase !== phase) {
      continue;
    }
    if ((action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax) {
      aggressiveActions.push(action);
      currentMax = action.toAmount;
    }
  }

  return aggressiveActions;
}

function isFacingFlopCbet(hand: HandState, playerId: string): boolean {
  const preflopAggressor = getAggressiveActionsForPhase(hand, 'betting_preflop').at(-1)?.playerId ?? null;
  if (!preflopAggressor || preflopAggressor === playerId) {
    return false;
  }

  const flopAggressiveActions = getAggressiveActionsForPhase(hand, 'betting_flop');
  return flopAggressiveActions.length === 1 && flopAggressiveActions[0]?.playerId === preflopAggressor;
}

function isVoluntaryPreflopAction(action: HandActionRecord): boolean {
  return action.type === 'call' || action.type === 'raise_to' || action.type === 'all_in';
}

function isAggressivePreflopAction(action: HandActionRecord, currentMax: number): boolean {
  return (action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax;
}

function countVoluntaryPreflopEntrants(hand: HandState): number {
  const firstPreflopActions = new Map<string, HandActionRecord>();

  for (const action of hand.actions) {
    if (action.phase !== 'betting_preflop' || firstPreflopActions.has(action.playerId)) {
      continue;
    }
    firstPreflopActions.set(action.playerId, action);
  }

  return [...firstPreflopActions.values()].filter(isVoluntaryPreflopAction).length;
}

function didBenchmarkHumanOpenUnopened(hand: HandState, benchmarkHumanId: string): boolean {
  let currentMax = hand.blinds.bigBlind;

  for (const action of hand.actions) {
    if (action.phase !== 'betting_preflop') {
      continue;
    }

    const isAggressive = isAggressivePreflopAction(action, currentMax);
    if (action.playerId === benchmarkHumanId) {
      return isAggressive;
    }
    if (isAggressive) {
      currentMax = action.toAmount;
    }
  }

  return false;
}

function recordTablePacingStats(
  counters: TablePacingCounters,
  hand: HandState,
  input: { benchmarkHumanId?: string | null },
): void {
  counters.hands += 1;
  counters.totalVoluntaryEntrants += countVoluntaryPreflopEntrants(hand);

  if (hand.communityCards.length >= 3) {
    counters.handsSawFlop += 1;
  } else {
    counters.handsEndedPreflop += 1;
  }

  if (!input.benchmarkHumanId || !didBenchmarkHumanOpenUnopened(hand, input.benchmarkHumanId)) {
    return;
  }

  counters.humanOpenOpportunities += 1;
  const benchmarkHumanWonPreflop = hand.communityCards.length < 3 && hand.payouts.some((payout) => payout.playerId === input.benchmarkHumanId);
  if (benchmarkHumanWonPreflop) {
    counters.humanOpenWalks += 1;
  }
}

function summarizeMetric(counter: MetricCounter): SummaryMetric {
  return {
    count: counter.count,
    opportunities: counter.opportunities,
    rate: counter.opportunities === 0 ? 0 : counter.count / counter.opportunities,
  };
}

function summarizeCounters(counters: PlayerMetricCounters): SummaryMetrics {
  return {
    handsDealt: counters.handsDealt,
    sawFlopHands: counters.sawFlopHands,
    vpip: summarizeMetric(counters.vpip),
    pfr: summarizeMetric(counters.pfr),
    threeBet: summarizeMetric(counters.threeBet),
    foldToOpen: summarizeMetric(counters.foldToOpen),
    cbet: summarizeMetric(counters.cbet),
    foldToCbet: summarizeMetric(counters.foldToCbet),
    wentToShowdown: summarizeMetric(counters.wentToShowdown),
    wonAtShowdown: summarizeMetric(counters.wonAtShowdown),
    rfiByPosition: {
      utg: summarizeMetric(counters.rfiByPosition.utg),
      hj: summarizeMetric(counters.rfiByPosition.hj),
      co: summarizeMetric(counters.rfiByPosition.co),
      btn: summarizeMetric(counters.rfiByPosition.btn),
      sb: summarizeMetric(counters.rfiByPosition.sb),
      bb: summarizeMetric(counters.rfiByPosition.bb),
    },
  };
}

function summarizeTablePacing(counters: TablePacingCounters): TablePacingSummary {
  return {
    hands: counters.hands,
    avgVoluntaryEntrants: counters.hands === 0 ? 0 : counters.totalVoluntaryEntrants / counters.hands,
    sawFlopRate: counters.hands === 0 ? 0 : counters.handsSawFlop / counters.hands,
    walkRate: counters.hands === 0 ? 0 : counters.handsEndedPreflop / counters.hands,
    humanOpenOpportunities: counters.humanOpenOpportunities,
    humanOpenWalkRate: counters.humanOpenOpportunities === 0 ? 0 : counters.humanOpenWalks / counters.humanOpenOpportunities,
    maxBotPreflopFoldStreak: counters.maxBotPreflopFoldStreak,
  };
}

function mergeCounters(target: PlayerMetricCounters, source: PlayerMetricCounters): void {
  target.handsDealt += source.handsDealt;
  target.sawFlopHands += source.sawFlopHands;
  mergeMetric(target.vpip, source.vpip);
  mergeMetric(target.pfr, source.pfr);
  mergeMetric(target.threeBet, source.threeBet);
  mergeMetric(target.foldToOpen, source.foldToOpen);
  mergeMetric(target.cbet, source.cbet);
  mergeMetric(target.foldToCbet, source.foldToCbet);
  mergeMetric(target.wentToShowdown, source.wentToShowdown);
  mergeMetric(target.wonAtShowdown, source.wonAtShowdown);
  for (const position of POSITIONS) {
    mergeMetric(target.rfiByPosition[position], source.rfiByPosition[position]);
  }
}

function mergeMetric(target: MetricCounter, source: MetricCounter): void {
  target.count += source.count;
  target.opportunities += source.opportunities;
}

export function summarizeBotStats(tracker: BotStatTracker, tableCounters: TablePacingCounters = createTablePacingCounters()): BotSimulationSummary {
  const players: Record<string, SummaryMetrics> = {};
  const aggregatedByPersonality: Record<BotPersonality, PlayerMetricCounters> = {
    fish: createPlayerMetricCounters(),
    tag: createPlayerMetricCounters(),
    lag: createPlayerMetricCounters(),
  };

  for (const [playerId, counters] of tracker.players.entries()) {
    players[playerId] = summarizeCounters(counters);
    const personality = tracker.personalities.get(playerId);
    if (!personality) {
      continue;
    }
    mergeCounters(aggregatedByPersonality[personality], counters);
  }

  return {
    players,
    personalities: {
      fish: summarizeCounters(aggregatedByPersonality.fish),
      tag: summarizeCounters(aggregatedByPersonality.tag),
      lag: summarizeCounters(aggregatedByPersonality.lag),
    },
    table: summarizeTablePacing(tableCounters),
  };
}

export function simulateBotStats(options: SimulateBotStatsOptions = {}): BotSimulationReport {
  const bigBlind = options.bigBlind ?? 20;
  const smallBlind = options.smallBlind ?? Math.max(1, Math.floor(bigBlind / 2));
  const seed = options.seed ?? DEFAULT_SEED;
  const seats = (options.seats ?? DEFAULT_SEATS).slice().sort((left, right) => left.seatIndex - right.seatIndex);
  const segments = resolveSegments(options);
  const baseline = simulateScenario({
    seats: seats.map((seat) => ({ ...seat, actor: 'bot' as const })),
    segments,
    smallBlind,
    bigBlind,
    seed,
  });
  const includeTrainingTable = options.includeTrainingTable !== false;
  const baseReport = {
    hands: segments.reduce((sum, segment) => sum + segment.hands, 0),
    seed,
    seats,
    segments: baseline.segments,
    overall: baseline.overall,
  };

  if (!includeTrainingTable) {
    return baseReport;
  }

  return {
    ...baseReport,
    trainingTable: simulateScenario({
      seats: resolveTrainingTableSeats(seats),
      segments,
      smallBlind,
      bigBlind,
      seed: seed ^ 0x9e3779b9,
    }),
  };
}

function resolveSegments(options: SimulateBotStatsOptions): BotSimulationSegment[] {
  if (options.segments && options.segments.length > 0) {
    return options.segments;
  }

  const hands = options.hands ?? 3000;
  const stackBbs = [100, 40, 20, 10];
  const baseHands = Math.floor(hands / stackBbs.length);
  let remainder = hands % stackBbs.length;

  return stackBbs.map((stackBb) => {
    const segmentHands = baseHands + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return {
      label: `${stackBb}bb`,
      hands: segmentHands,
      stackBb,
    };
  });
}

function resolveTrainingTableSeats(seats: ReadonlyArray<BotSeatConfig>): SimulationSeatConfig[] {
  if (seats.length < 5) {
    return [...DEFAULT_TRAINING_TABLE_SEATS];
  }

  return [
    DEFAULT_TRAINING_TABLE_SEATS[0]!,
    ...seats.slice(0, 5).map((seat, index) => ({
      id: seat.id,
      name: seat.name,
      seatIndex: index + 1,
      actor: 'bot' as const,
      personality: seat.personality,
    })),
  ];
}

function getTrackedBotPlayers(
  seats: ReadonlyArray<SimulationSeatConfig>
): Array<{ id: string; personality: BotPersonality }> {
  return seats
    .filter((seat): seat is SimulationSeatConfig & { actor: 'bot'; personality: BotPersonality } => seat.actor === 'bot' && seat.personality !== undefined)
    .map((seat) => ({ id: seat.id, personality: seat.personality }));
}

function simulateScenario(input: {
  seats: ReadonlyArray<SimulationSeatConfig>;
  segments: ReadonlyArray<BotSimulationSegment>;
  smallBlind: number;
  bigBlind: number;
  seed: number;
}): TrainingTableSimulationReport {
  const trackedBotPlayers = getTrackedBotPlayers(input.seats);
  const rng = sequenceRng(input.seed);
  const overallTracker = createBotStatTracker(trackedBotPlayers);
  const overallTableCounters = createTablePacingCounters();
  const room = createSimulationRoom({
    seats: input.seats,
    smallBlind: input.smallBlind,
    bigBlind: input.bigBlind,
  });
  const benchmarkHumanId = input.seats.find((seat) => seat.actor === 'benchmark_human')?.id ?? null;

  const segments = input.segments.map((segment) => {
    const tracker = createBotStatTracker(trackedBotPlayers);
    const tableCounters = createTablePacingCounters();
    resetBotPreflopFoldStreaks(room);
    for (let handIndex = 0; handIndex < segment.hands; handIndex += 1) {
      playSimulatedHand({
        room,
        tracker,
        overallTracker,
        tableCounters,
        overallTableCounters,
        stackBb: segment.stackBb,
        rng,
        benchmarkHumanId,
      });
    }
    return {
      label: segment.label,
      hands: segment.hands,
      stackBb: segment.stackBb,
      summary: summarizeBotStats(tracker, tableCounters),
    };
  });

  return {
    seats: [...input.seats],
    segments,
    overall: summarizeBotStats(overallTracker, overallTableCounters),
  };
}

function createSimulationRoom(input: {
  seats: ReadonlyArray<SimulationSeatConfig>;
  smallBlind: number;
  bigBlind: number;
}): RuntimeRoom {
  const players = new Map<string, RuntimePlayer>(
    input.seats.map((seat) => {
      const basePlayer = {
        id: seat.id,
        name: seat.name,
        seatIndex: seat.seatIndex,
        stack: input.bigBlind * 100,
        isBot: seat.actor === 'bot',
      };
      if (seat.actor === 'bot') {
        if (!seat.personality) {
          throw new Error(`Missing bot personality for simulation seat ${seat.id}`);
        }
        const runtimePlayer: RuntimePlayer = { ...basePlayer, botStrategy: seat.personality };
        return [seat.id, runtimePlayer];
      }

      const runtimePlayer: RuntimePlayer = basePlayer;
      return [seat.id, runtimePlayer];
    })
  );

  return {
    id: 'bot-sim',
    stateVersion: 0,
    handNumber: 0,
    smallBlind: input.smallBlind,
    bigBlind: input.bigBlind,
    actionTimeoutMs: 0,
    players,
    readyPlayerIds: new Set(input.seats.map((seat) => seat.id)),
    pendingDisconnectPlayerIds: new Set(),
    spectatingPlayerIds: new Set(),
    hand: null,
    lastActionSeqByPlayer: new Map(),
    lastBroadcastActionCount: 0,
    lastButtonMarkerSeat: null,
  };
}

function playSimulatedHand(input: {
  room: RuntimeRoom;
  tracker: BotStatTracker;
  overallTracker: BotStatTracker;
  tableCounters: TablePacingCounters;
  overallTableCounters: TablePacingCounters;
  stackBb: number;
  rng: () => number;
  benchmarkHumanId: string | null;
}): void {
  const { room, tracker, overallTracker, tableCounters, overallTableCounters, stackBb, rng, benchmarkHumanId } = input;
  const stackSize = Math.max(room.bigBlind, Math.round(room.bigBlind * stackBb));

  for (const player of room.players.values()) {
    player.stack = stackSize;
  }

  const initialized = initializeHand({
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      seatIndex: player.seatIndex,
      stack: player.stack,
    })),
    buttonMarkerSeat: resolveButtonMarkerSeatForNextHand(room, undefined, rng),
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    rng,
  });

  if (!initialized.ok) {
    throw new Error(`Failed to initialize simulated hand: ${initialized.error}`);
  }

  room.hand = initialized.value;
  room.handNumber += 1;
  room.lastButtonMarkerSeat = initialized.value.buttonMarkerSeat;
  startTrackedHand(tracker, room.hand);
  startTrackedHand(overallTracker, room.hand);

  while (room.hand && room.hand.currentActorSeat !== null) {
    const actor = getRoomPlayerBySeat(room, room.hand.currentActorSeat);
    if (!actor) {
      break;
    }

    const context = buildBotDecisionContext(room, actor.id);
    if (!context) {
      break;
    }
    const isFirstPreflopDecision = context.phase === 'preflop' && isFirstPreflopDecisionForPlayer(room.hand, actor.id);
    const action = actor.isBot
      ? chooseBotAction(context, actor.botStrategy ?? 'fish', rng, {
          preflopConsecutiveFolds: getBotPreflopFoldStreak(room, actor.id),
          isFirstPreflopDecision,
        })
      : chooseBenchmarkHumanAction(context, rng);
    if (actor.isBot) {
      recordBotDecisionStats(tracker, {
        playerId: actor.id,
        hand: room.hand,
        context,
        action,
      });
      recordBotDecisionStats(overallTracker, {
        playerId: actor.id,
        hand: room.hand,
        context,
        action,
      });
    }

    const handBeforeAction = room.hand;
    const result = applyAction(handBeforeAction, toPlayerActionInput(actor.id, action), { timestamp: handBeforeAction.actions.length + 1 });
    if (!result.ok) {
      throw new Error(`Failed to apply simulated action: ${result.error}`);
    }
    if (actor.isBot) {
      trackBotPreflopEntryDecision(room, handBeforeAction, actor.id, action.type);
      if (isFirstPreflopDecision) {
        const streak = getBotPreflopFoldStreak(room, actor.id);
        tableCounters.maxBotPreflopFoldStreak = Math.max(tableCounters.maxBotPreflopFoldStreak, streak);
        overallTableCounters.maxBotPreflopFoldStreak = Math.max(overallTableCounters.maxBotPreflopFoldStreak, streak);
      }
    }

    room.hand = result.value;
    syncRoomPlayersFromHand(room);
  }

  if (room.hand) {
    recordBotHandResultStats(tracker, room.hand);
    recordBotHandResultStats(overallTracker, room.hand);
    recordTablePacingStats(tableCounters, room.hand, { benchmarkHumanId });
    recordTablePacingStats(overallTableCounters, room.hand, { benchmarkHumanId });
  }
}

function chooseBenchmarkHumanAction(context: BotDecisionContext, rng: () => number): BotAction {
  return chooseBotAction(context, 'tag', rng);
}

function getRoomPlayerBySeat(room: RuntimeRoom, seatIndex: number): RuntimePlayer | undefined {
  return [...room.players.values()].find((player) => player.seatIndex === seatIndex);
}

function toPlayerActionInput(playerId: string, action: BotAction): PlayerActionInput {
  switch (action.type) {
    case 'call':
      return { playerId, type: 'call' };
    case 'raise_to':
      return { playerId, type: 'raise_to', amount: action.amount };
    case 'all_in':
      return { playerId, type: 'all_in' };
    case 'check':
      return { playerId, type: 'check' };
    default:
      return { playerId, type: 'fold' };
  }
}

function sequenceRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function formatPercent(metric: SummaryMetric): string {
  return `${(metric.rate * 100).toFixed(1)}%`;
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSummaryTable(summary: BotSimulationSummary): string {
  const rows = (['fish', 'tag', 'lag'] as BotPersonality[]).map((personality) => {
    const metrics = summary.personalities[personality];
    return [
      personality.toUpperCase(),
      String(metrics.handsDealt),
      formatPercent(metrics.vpip),
      formatPercent(metrics.pfr),
      formatPercent(metrics.threeBet),
      formatPercent(metrics.foldToOpen),
      formatPercent(metrics.cbet),
      formatPercent(metrics.foldToCbet),
      formatPercent(metrics.wentToShowdown),
      formatPercent(metrics.wonAtShowdown),
      formatPercent(metrics.rfiByPosition.utg),
      formatPercent(metrics.rfiByPosition.co),
      formatPercent(metrics.rfiByPosition.btn),
      formatPercent(metrics.rfiByPosition.sb),
    ];
  });

  const headers = ['Bot', 'Hands', 'VPIP', 'PFR', '3Bet', 'FoldOpen', 'CBet', 'FoldCBet', 'WTSD', 'W$SD', 'RFI UTG', 'RFI CO', 'RFI BTN', 'RFI SB'];
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  const formatRow = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join('  ');

  return [formatRow(headers), formatRow(widths.map((width) => ''.padEnd(width, '-'))), ...rows.map(formatRow)].join('\n');
}

function formatTablePacingTable(table: TablePacingSummary): string {
  const rows = [
    ['Hands', String(table.hands)],
    ['Avg Entrants', table.avgVoluntaryEntrants.toFixed(2)],
    ['Saw Flop', formatRate(table.sawFlopRate)],
    ['Walk Rate', formatRate(table.walkRate)],
    ['Human Open Ops', String(table.humanOpenOpportunities)],
    ['Human Open Walk', table.humanOpenOpportunities === 0 ? 'n/a' : formatRate(table.humanOpenWalkRate)],
    ['Max Bot Fold Streak', String(table.maxBotPreflopFoldStreak)],
  ];

  const headers = ['Metric', 'Value'];
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  const formatRow = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join('  ');

  return [formatRow(headers), formatRow(widths.map((width) => ''.padEnd(width, '-'))), ...rows.map(formatRow)].join('\n');
}

function printScenarioReport(label: string, report: TrainingTableSimulationReport): void {
  console.log(`\n${label}`);
  console.log(formatSummaryTable(report.overall));
  console.log('\nTable Pacing');
  console.log(formatTablePacingTable(report.overall.table));

  for (const segment of report.segments) {
    console.log(`\n${segment.label} (${segment.hands} hands)`);
    console.log(formatSummaryTable(segment.summary));
    console.log('\nTable Pacing');
    console.log(formatTablePacingTable(segment.summary.table));
  }
}

function parseCliArgs(argv: string[]): SimulateBotStatsOptions {
  const options: SimulateBotStatsOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === '--hands') {
      const next = argv[index + 1];
      if (next) {
        options.hands = Number.parseInt(next, 10);
        index += 1;
      }
      continue;
    }

    if (arg === '--seed') {
      const next = argv[index + 1];
      if (next) {
        options.seed = Number.parseInt(next, 10);
        index += 1;
      }
      continue;
    }

    if (arg === '--stacks') {
      const next = argv[index + 1];
      if (next) {
        const stackBbs = next
          .split(',')
          .map((value) => Number.parseInt(value.trim(), 10))
          .filter((value) => Number.isFinite(value) && value > 0);
        const hands = options.hands ?? 3000;
        const baseHands = Math.floor(hands / Math.max(1, stackBbs.length));
        let remainder = hands % Math.max(1, stackBbs.length);
        options.segments = stackBbs.map((stackBb) => {
          const segmentHands = baseHands + (remainder > 0 ? 1 : 0);
          remainder = Math.max(0, remainder - 1);
          return {
            label: `${stackBb}bb`,
            hands: segmentHands,
            stackBb,
          };
        });
        index += 1;
      }
      continue;
    }

    if (arg === '--no-training-table') {
      options.includeTrainingTable = false;
    }
  }

  return options;
}

function runCli(): void {
  const options = parseCliArgs(process.argv.slice(2));
  const report = simulateBotStats(options);

  console.log(`Seed: ${report.seed}`);
  console.log(`Hands: ${report.hands}`);
  console.log(`Pool: ${report.seats.map((seat) => `${seat.personality}@${seat.seatIndex}`).join(', ')}`);
  printScenarioReport('Bot-Only Pool', {
    seats: report.seats.map((seat) => ({ ...seat, actor: 'bot' as const })),
    segments: report.segments,
    overall: report.overall,
  });

  if (report.trainingTable) {
    const seatSummary = report.trainingTable.seats
      .map((seat) => `${seat.actor === 'benchmark_human' ? 'hero' : seat.personality}@${seat.seatIndex}`)
      .join(', ');
    console.log(`\nTraining Table Seats: ${seatSummary}`);
    printScenarioReport('Training Table (1 Hero + 5 Bots)', report.trainingTable);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli();
}
