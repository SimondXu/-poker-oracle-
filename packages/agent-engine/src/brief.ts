import { buildBotPositionMap, formatBotPositionLabel, type BotPosition } from '@aipoker/shared';

import type { MenuOption } from './menu.ts';
import { TOOLS, runTool, type ToolArgs, type ToolContext, type ToolName } from './tools/index.ts';
import type { ToolRun } from './trace.ts';

/**
 * full: the realtime brief (arm A1), every eager tool run before the call. minimal: deep mode's
 * starting point (arm A3), only the hand, the board, the price and the menu; the rest is asked for.
 */
export type BriefKind = 'full' | 'minimal';

/** How the brief is worded and which numbers it carries; a prompt version names one (`PROMPTS[version].brief`). */
export type BriefFormat = 'brief-0';
export const DEFAULT_BRIEF_FORMAT: BriefFormat = 'brief-0';

export interface Brief {
  kind: BriefKind;
  ms: number;
  tools: Array<ToolRun & { result: unknown }>;
}

/** Runs the brief's tools; the realtime brief is the deep-mode tools run eagerly, with the same seeds. */
export function buildBrief(ctx: ToolContext, kind: BriefKind): Brief {
  const started = performance.now();
  const calls: Array<[ToolName, ToolArgs]> = [
    ['hand_strength', NO_ARGS],
    ['board_texture', NO_ARGS],
    ['price', NO_ARGS],
    ['legal_options', NO_ARGS],
  ];
  if (kind === 'full') {
    calls.push(['equity', NO_ARGS]);
    for (const opponent of ctx.context.opponents ?? []) {
      const seat = ctx.seatOf(opponent.id);
      calls.push(['opponent_profile', { seat, option: null }], ['opponent_range', { seat, option: null }]);
    }
    if (ctx.context.phase === 'preflop') {
      calls.push(['preflop_chart', NO_ARGS]);
    }
  }
  const tools = calls.map(([name, args]) => runTool(ctx, name, args));
  return { kind, ms: performance.now() - started, tools };
}

const NO_ARGS: ToolArgs = { seat: null, option: null };

type Output<Name extends ToolName> = ReturnType<(typeof TOOLS)[Name]['execute']>;

function resultOf<Name extends ToolName>(brief: Brief, name: Name, seat: number | null = null): Output<Name> | null {
  const run = brief.tools.find((candidate) => candidate.tool === name && candidate.args.seat === seat);
  return run?.ok ? (run.result as Output<Name>) : null;
}

// ---- formatting

const chips = (value: number) => Math.round(value).toLocaleString('en-US');
const percent = (share: number) => (share > 0 && share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);
const bb = (value: number) => `${value.toFixed(1)} bb`;

function potShareLabel(share: number): string {
  if (Math.abs(share - 1) < 0.005) {
    return 'pot';
  }
  return share < 1 ? `${percent(share)} of the pot` : `${share.toFixed(1)}× the pot`;
}

function seatList(seats: readonly number[]): string {
  return seats.length <= 1 ? `Seat ${seats.join('')}` : `Seats ${seats.slice(0, -1).join(', ')} and ${seats.at(-1)}`;
}

const STREET_LABELS: Record<string, string> = {
  betting_preflop: 'Preflop',
  betting_flop: 'Flop',
  betting_turn: 'Turn',
  betting_river: 'River',
};
const STREET_BOARD: Record<string, [number, number]> = {
  betting_preflop: [0, 0],
  betting_flop: [0, 3],
  betting_turn: [3, 4],
  betting_river: [4, 5],
};

const CATEGORY_LABELS: Record<string, string> = {
  high_card: 'no pair',
  pair: 'one pair',
  two_pair: 'two pair',
  trips: 'three of a kind',
  straight: 'a straight',
  flush: 'a flush',
  full_house: 'a full house',
  quads: 'four of a kind',
  straight_flush: 'a straight flush',
};
const PAIR_KIND_LABELS: Record<string, string> = {
  overpair: 'an overpair',
  top: 'top pair',
  second: 'second pair',
  lower: 'a lower pair',
  underpair: 'a pocket pair below the top card',
};
const DRAW_LABELS: Record<string, string> = {
  flush: 'flush draw',
  oesd: 'open-ended straight draw',
  gutshot: 'gutshot',
  backdoorFlush: 'backdoor flush draw',
  backdoorStraight: 'backdoor straight draw',
  twoOvercards: 'two overcards',
};

// ---- sections

function header(ctx: ToolContext, handNumber: number, positions: Map<number, BotPosition>): string {
  const { context, view } = ctx;
  const self = view.players.find((player) => player.id === ctx.selfId)!;
  return [
    `HAND ${handNumber}`,
    `blinds ${chips(context.smallBlind)}/${chips(context.bigBlind)}`,
    `${context.activePlayerCount} players`,
    `you are Seat ${ctx.seatOf(self.id)} (${formatBotPositionLabel(positions.get(self.seatIndex) ?? context.position)})`,
    `stack ${chips(context.myStack)}`,
  ].join(' · ');
}

function handSection(ctx: ToolContext, brief: Brief): string[] {
  const { context } = ctx;
  const strength = resultOf(brief, 'hand_strength')!;
  const lines = [
    `Cards: ${context.holeCards.join(' ')} (${strength.handKey}, top ${Math.max(1, Math.round(strength.preflop.percentile * 100))}% of starting hands)`,
  ];
  const chart = resultOf(brief, 'preflop_chart');
  if (chart) {
    lines.push(`Standard width from your seat: a tight player plays about ${percent(chart.standardWidth)} of hands here${chart.buttonWidth === null ? '' : ` (the button plays ${percent(chart.buttonWidth)})`}`);
  }
  const texture = resultOf(brief, 'board_texture');
  if (strength.made && texture?.suits) {
    const street = context.phase;
    lines.push(`Board (${street}): ${context.communityCards.join(' ')} · ${[
      texture.suits.replace('_', '-'),
      texture.flushPossible && texture.suits !== 'monotone' ? 'flush possible' : null,
      texture.paired ? 'paired' : 'unpaired',
      texture.connected ? 'connected' : 'not connected',
    ].filter(Boolean).join(', ')}`);
    const made = strength.made.boardPlays
      ? `the board plays (${CATEGORY_LABELS[strength.made.category]} on the board)`
      : [CATEGORY_LABELS[strength.made.category], strength.made.pairKind ? PAIR_KIND_LABELS[strength.made.pairKind] : null].filter(Boolean).join(', ');
    const draws = Object.entries(strength.draws).filter(([, present]) => present).map(([draw]) => DRAW_LABELS[draw]);
    const outs = strength.nominalOuts ? ` (about ${strength.nominalOuts} outs, nominal)` : '';
    lines.push(`Made: ${made} · Draws: ${draws.length > 0 ? draws.join(', ') + outs : 'none'}`);
  }
  return lines;
}

function priceSection(ctx: ToolContext, brief: Brief): string[] {
  const price = resultOf(brief, 'price')!;
  return [[
    `Pot ${chips(price.pot)}`,
    price.toCall > 0 ? `to call ${chips(price.toCall)} · pot odds ${percent(price.potOdds)}` : 'nothing to call',
    ctx.context.phase === 'preflop' ? null : `SPR at the start of the ${ctx.context.phase} ${price.sprAtStreetStart.toFixed(1)}`,
    `effective stack ${chips(price.effectiveStack)} (${bb(price.effectiveStackBb)})`,
  ].filter(Boolean).join(' · ')];
}

function equitySection(brief: Brief): string[] {
  const equity = resultOf(brief, 'equity');
  if (!equity || equity.equity === null) {
    return [];
  }
  const error = equity.exact ? ' (exact)' : ` ± ${percent(Math.max(equity.stdErr!, 0.001))}`;
  const against = equity.against === 'random'
    ? `against random hands for ${seatList(equity.seats)}`
    : equity.seats.length === 1
      ? `against Seat ${equity.seats[0]}'s likely hands`
      : `against the likely hands of ${seatList(equity.seats)}`;
  return [`${percent(equity.equity)}${error} ${against}`];
}

function statLabel(label: string, stat: { rate: number | null; n: number }): string {
  return `${label} ${stat.rate === null ? '–' : percent(stat.rate)} (n ${stat.n})`;
}

function opponentsSection(ctx: ToolContext, brief: Brief): string[] {
  return (ctx.context.opponents ?? [])
    .map((opponent) => ctx.seatOf(opponent.id))
    .sort((left, right) => left - right)
    .flatMap((seat) => {
      const profile = resultOf(brief, 'opponent_profile', seat)!;
      const range = resultOf(brief, 'opponent_range', seat)!;
      const head = [`Seat ${seat}`, formatBotPositionLabel(profile.position), `stack ${chips(profile.stack)}${profile.stack === 0 ? ' (all-in)' : ''}`];
      const stats = profile.hands === 0
        ? ['no hands observed yet']
        : [
            `${profile.hands} hands`,
            statLabel('VPIP', profile.vpip),
            statLabel('PFR', profile.pfr),
            statLabel('aggression after the flop', profile.aggression),
            statLabel('fold to a bet', profile.foldToBet),
          ];
      const likely = [`about ${percent(range.share)} of starting hands`];
      if (range.onBoard) {
        likely.push(`on this board about ${percent(range.onBoard.onePair)} one pair, ${percent(range.onBoard.twoPairPlus)} two pair or better, ${percent(range.onBoard.noPair)} no pair${range.onBoard.strongDraw > 0 ? `, ${percent(range.onBoard.strongDraw)} strong draws` : ''}`);
        likely.push(`${percent(range.beatsYou!)} beat you now`);
      }
      return [[...head, ...stats].join(' · '), `  likely hands: ${likely.join('; ')}`];
    });
}

function seatsSection(ctx: ToolContext, positions: Map<number, BotPosition>): string[] {
  return (ctx.context.opponents ?? [])
    .map((opponent) => ctx.view.players.find((player) => player.id === opponent.id)!)
    .sort((left, right) => left.seatIndex - right.seatIndex)
    .map((player) => [
      `Seat ${ctx.seatOf(player.id)}`,
      formatBotPositionLabel(positions.get(player.seatIndex) ?? 'utg'),
      `stack ${chips(player.stack)}${player.status === 'all_in' ? ' (all-in)' : ''}`,
    ].join(' · '));
}

/**
 * The hand so far, street by street. Calls are shown at the price they matched: the engine logs a
 * call that closes a street after the street resets, so its own total reads 0.
 */
function actionSection(ctx: ToolContext, positions: Map<number, BotPosition>): string[] {
  const { view, context } = ctx;
  const streets = Object.keys(STREET_LABELS).slice(0, Object.keys(STREET_LABELS).indexOf(view.phase) + 1);
  return streets.map((street) => {
    const actions = view.actions.filter((action) => action.phase === street);
    const [from, to] = STREET_BOARD[street]!;
    const cards = from === to ? '' : ` ${context.communityCards.slice(from, to).join(' ')}`;
    const pot = actions[0]?.potTotalBefore ?? context.potTotal;
    let currentMax = street === 'betting_preflop' ? view.bigBlind : 0;
    const described = actions.map((action) => {
      const player = view.players.find((candidate) => candidate.id === action.playerId)!;
      const who = action.playerId === ctx.selfId
        ? 'you'
        : `Seat ${ctx.seatOf(action.playerId)} ${formatBotPositionLabel(positions.get(player.seatIndex) ?? 'utg')}`;
      const raises = (action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax;
      let verb: string;
      if (action.type === 'fold' || action.type === 'check') {
        verb = action.type;
      } else if (!raises) {
        verb = action.type === 'all_in' ? 'call all-in' : `call ${chips(currentMax)}`;
      } else if (action.type === 'all_in') {
        verb = `all-in ${chips(action.toAmount)}`;
      } else if (currentMax === 0) {
        verb = `bet ${chips(action.toAmount)} (${percent(action.toAmount / Math.max(1, action.potTotalBefore))} of the pot)`;
      } else {
        verb = `raise to ${chips(action.toAmount)}`;
      }
      if (raises) {
        currentMax = action.toAmount;
      }
      return `${who} ${verb}`;
    });
    return `${STREET_LABELS[street]}${cards} (pot ${chips(pot)}): ${described.length > 0 ? described.join(' · ') : 'no action yet'}`;
  });
}

function menuLine(option: MenuOption, context: ToolContext['context']): string {
  let action: string;
  switch (option.kind) {
    case 'fold':
    case 'check':
      return `${option.id}  ${option.kind}`;
    case 'call':
      return `${option.id}  call ${chips(context.callAmount)}${context.myStreetCommitted > 0 ? ` (to ${chips(option.to!)})` : ''}${context.callAmount >= context.myStack ? ', all-in' : ''}`;
    case 'bet':
      action = `bet ${chips(option.to!)}`;
      break;
    case 'raise':
      action = `raise to ${chips(option.to!)}`;
      break;
    default:
      action = `all-in ${chips(option.to!)}`;
  }
  return [
    `${option.id}  ${action}`,
    bb(option.toBb!),
    potShareLabel(option.potShare!),
    `bluff needs ${percent(option.bluffBreakEven!)} folds`,
  ].join(' · ');
}

export interface UserMessageInput {
  ctx: ToolContext;
  brief: Brief;
  handNumber: number;
  /** Rendered memory lines; empty for none. */
  notes: readonly string[];
  /** Defaults to brief-0, the text of prompt v0. */
  format?: BriefFormat;
}

/** The user message: brief, notes, the hand's action and the menu. Seats only, never names or ids. */
export function renderUserMessage({ ctx, brief, handNumber, notes }: UserMessageInput): string {
  const { context, view } = ctx;
  const positions = buildBotPositionMap(
    view.players.filter((player) => player.status !== 'out' && player.status !== 'sitting_out').map((player) => player.seatIndex),
    view.buttonMarkerSeat,
  );
  const menu = resultOf(brief, 'legal_options')!;
  const sections: Array<[string, string[]]> = [
    ['HAND', handSection(ctx, brief)],
    ['PRICE', priceSection(ctx, brief)],
    ...(brief.kind === 'full'
      ? [['EQUITY', equitySection(brief)], ['OPPONENTS', opponentsSection(ctx, brief)]] as Array<[string, string[]]>
      : [['SEATS', seatsSection(ctx, positions)]] as Array<[string, string[]]>),
    ['NOTES', [...notes]],
    ['ACTION', actionSection(ctx, positions)],
    [`MENU (${context.callAmount > 0 && context.canCall ? `to call ${chips(context.callAmount)}` : 'nothing to call'})`, menu.map((option) => menuLine(option, context))],
  ];
  return [
    header(ctx, handNumber, positions),
    ...sections.filter(([, lines]) => lines.length > 0).map(([title, lines]) => [title, ...lines].join('\n')),
  ].join('\n\n');
}
