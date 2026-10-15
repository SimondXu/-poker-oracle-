import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBrief,
  buildMenu,
  canonicalJson,
  createToolContext,
  hashJson,
  renderUserMessage,
  runTool,
  type BotTurnInput,
  type ToolArgs,
  type ToolName,
} from '@aipoker/agent-engine';
import type { Card, CoachAdvice, CoachReviewDecision, GameReviewEvent } from '@aipoker/shared';
import { createStableAnalysisRng } from '@aipoker/strategy-engine';

import { buildBotTurnInput } from '../../../game-loop/bot-view.ts';
import type { RuntimeRoom } from '../../../rooms/types.ts';
import { playerNameFor, seededBotSpots, type BotSpot } from '../../../tools/bot-spots.ts';

/** Every tool call deep mode could make here, plus both briefs in both formats: everything a prompt can be built from. */
function everythingTheBotSees(input: BotTurnInput, seedBase = input.seedBase) {
  const ctx = createToolContext({ ...input, seedBase });
  const seats = (input.context.opponents ?? []).map((opponent) => ctx.seatOf(opponent.id));
  const calls: Array<[ToolName, ToolArgs]> = [
    ['equity', { seat: null, option: null }],
    ['preflop_chart', { seat: null, option: null }],
    ['advisor', { seat: null, option: null }],
    ['bet_estimates', { seat: null, option: null }],
    ...seats.flatMap((seat): Array<[ToolName, ToolArgs]> => [
      ['equity', { seat, option: null }],
      ['opponent_profile', { seat, option: null }],
      ['opponent_range', { seat, option: null }],
      ['opponent_read', { seat, option: null }],
    ]),
    ...buildMenu(input.context).filter((option) => option.potShare !== null)
      .map((option): [ToolName, ToolArgs] => ['own_range', { seat: null, option: option.id }]),
  ];
  const messages = (['brief-0', 'brief-1'] as const).flatMap((format) => (['full', 'minimal'] as const).map((kind) =>
    renderUserMessage({ ctx, brief: buildBrief(ctx, kind, format), handNumber: input.handNumber, notes: [], format })));
  const tools = calls.map(([name, args]) => {
    const run = runTool(ctx, name, args);
    return { tool: run.tool, args: run.args, ok: run.ok, error: run.error, result: run.result };
  });
  // Prompt v1.2: the same brief and estimates with the line model.
  const lineCtx = createToolContext({ ...input, seedBase }, { foldModel: 'line' });
  const lineRun = runTool(lineCtx, 'bet_estimates', { seat: null, option: null });
  const line = {
    message: renderUserMessage({ ctx: lineCtx, brief: buildBrief(lineCtx, 'full', 'brief-1'), handNumber: input.handNumber, notes: [], format: 'brief-1' }),
    estimates: { ok: lineRun.ok, error: lineRun.error, result: lineRun.result },
  };
  return { messages, tools, line };
}

function seen(spot: Pick<BotSpot, 'room' | 'botId' | 'ledger'>): string {
  const input = buildBotTurnInput(spot.room, spot.botId, undefined, spot.ledger);
  assert.ok(input);
  return canonicalJson({ input: hashJson(input), ...everythingTheBotSees(input) });
}

const SEEN = new Map<BotSpot, string>();
function seenBefore(spot: BotSpot): string {
  const text = SEEN.get(spot) ?? seen(spot);
  SEEN.set(spot, text);
  return text;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
  }
  return shuffled;
}

/**
 * The same public spot with everything the bot must not know changed: every other player's hole
 * cards (folded ones included) and the deck are re-dealt from the same unseen cards, and the
 * coach maps are filled with humans' advice holding cards.
 */
function permuteHidden(room: RuntimeRoom, botId: string, seed: string): RuntimeRoom {
  const rng = createStableAnalysisRng(seed);
  const permuted = structuredClone(room);
  const hand = permuted.hand!;
  const others = hand.players.filter((player) => player.id !== botId);
  const pool = shuffle([...others.flatMap((player) => player.holeCards), ...hand.deck], rng);
  for (const player of others) {
    player.holeCards = pool.splice(0, 2);
  }
  hand.deck = pool;

  for (const player of others) {
    const cards = player.holeCards as Card[];
    permuted.coachAdvice.set(player.id, { spot: { holeCards: cards, board: hand.communityCards } } as unknown as CoachAdvice);
    permuted.coachRecords.set(player.id, [{ holeCards: cards } as unknown as CoachReviewDecision]);
    permuted.coachReviews.set(player.id, { decisions: [{ holeCards: cards }] } as unknown as GameReviewEvent);
    permuted.coachSessions.set(player.id, { matched: Math.floor(rng() * 9), close: 1, off: 2 } as never);
  }
  return permuted;
}

/** Four spots per street, so every street's tools and rendering are covered. */
const CANDIDATES = seededBotSpots(400, 'bot-view-hidden');
const SPOTS = ['betting_preflop', 'betting_flop', 'betting_turn', 'betting_river']
  .flatMap((phase) => CANDIDATES.filter((spot) => spot.room.hand!.phase === phase).slice(0, 4));

/** Heads-up, nothing to bet into yet, after the flop: where brief-1 prices the bets. Two per street. */
const HU_UNOPENED = ['betting_flop', 'betting_turn', 'betting_river'].flatMap((phase) =>
  CANDIDATES.filter((spot) => {
    const input = buildBotTurnInput(spot.room, spot.botId);
    return spot.room.hand!.phase === phase && input!.context.opponentCount === 1 && input!.context.currentBetToMatch === 0;
  }).slice(0, 2));
const ALL_SPOTS = [...SPOTS, ...HU_UNOPENED];

test('prompts and tool outputs are unchanged when hidden cards, the deck and room.coach* are permuted, ledger and brief-1 included', () => {
  assert.equal(SPOTS.length, 16);
  assert.equal(HU_UNOPENED.length, 6);
  assert.ok(ALL_SPOTS.every((spot) => Object.keys(spot.ledger.players).length > 0));
  for (const [index, spot] of ALL_SPOTS.entries()) {
    const permuted = permuteHidden(spot.room, spot.botId, `hidden-${index}`);
    assert.notDeepEqual(permuted.hand!.deck, spot.room.hand!.deck);
    assert.equal(seen({ room: permuted, botId: spot.botId, ledger: spot.ledger }), seenBefore(spot), `spot ${index}`);
  }
});

test("the permutation check would catch a leak: the bot's own cards do change what it sees", () => {
  const spot = SPOTS[0]!;
  const room = structuredClone(spot.room);
  const self = room.hand!.players.find((player) => player.id === spot.botId)!;
  const swapIndex = room.hand!.deck.findIndex((card) => !self.holeCards.includes(card));
  [self.holeCards[0], room.hand!.deck[swapIndex]] = [room.hand!.deck[swapIndex]!, self.holeCards[0]!];
  assert.notEqual(seen({ room, botId: spot.botId, ledger: spot.ledger }), seenBefore(spot));
});

test('no player id or name appears in any prompt or tool output', () => {
  for (const spot of ALL_SPOTS) {
    const text = seenBefore(spot);
    for (const player of spot.room.players.values()) {
      assert.ok(!text.includes(player.id), `id ${player.id}`);
      assert.ok(!text.includes(player.name), `name ${player.name}`);
    }
    assert.ok(!text.includes(playerNameFor(0).slice(0, 7)));
    assert.ok(!text.includes(spot.room.id));
  }
});

test('the same seed gives the same tool outputs; another seed moves the sampled equity', () => {
  let moved = 0;
  for (const spot of SPOTS.filter((_, index) => index % 4 === 0)) {
    const input = buildBotTurnInput(spot.room, spot.botId, undefined, spot.ledger)!;
    assert.deepEqual(everythingTheBotSees(input), everythingTheBotSees(buildBotTurnInput(spot.room, spot.botId, undefined, spot.ledger)!));
    const equity = (seedBase: string) => everythingTheBotSees(input, seedBase).tools.find((run) => run.tool === 'equity')!.result;
    moved += canonicalJson(equity(input.seedBase)) === canonicalJson(equity(`${input.seedBase}:other`)) ? 0 : 1;
  }
  assert.ok(moved > 0);
});

test("the turn input is frozen, holds only the bot's cards and is null off turn", () => {
  const spot = SPOTS[1]!;
  const input = buildBotTurnInput(spot.room, spot.botId)!;
  assert.ok(Object.isFrozen(input) && Object.isFrozen(input.view.players[0]) && Object.isFrozen(input.context));
  assert.deepEqual(
    input.view.players.filter((player) => player.holeCards.length > 0).map((player) => player.id),
    [spot.botId],
  );
  assert.deepEqual(Object.keys(input.view.players[0]!).sort(), ['handCommitted', 'holeCards', 'id', 'seatIndex', 'stack', 'status', 'streetCommitted']);
  const other = [...spot.room.players.keys()].find((id) => id !== spot.botId)!;
  assert.equal(buildBotTurnInput(spot.room, other), null);
});

test('brief-1 prices the bets heads-up and adds the ledger lines; the tools say the same', () => {
  let withShown = 0;
  for (const spot of HU_UNOPENED) {
    const input = buildBotTurnInput(spot.room, spot.botId, undefined, spot.ledger)!;
    const ctx = createToolContext(input);
    const message = renderUserMessage({ ctx, brief: buildBrief(ctx, 'full', 'brief-1'), handNumber: 1, notes: [], format: 'brief-1' });
    const river = input.context.phase === 'river';
    assert.match(message, /folds by bet size: under ½ pot \d+ of \d+/);
    assert.match(message, /est\. folds \d+%|est\. folds <1%/);
    assert.equal(/gain vs check/.test(message), river, input.context.phase);
    assert.equal(/stack-off size/.test(message), !river, input.context.phase);
    withShown += /hands shown: /.test(message) ? 1 : 0;

    const estimates = runTool(ctx, 'bet_estimates', { seat: null, option: null });
    assert.ok(estimates.ok);
    const options = (estimates.result as { options: Array<{ fold: number; bluffNeeds: number }> }).options;
    assert.ok(options.length > 0 && options.every((option) => option.fold > 0 && option.fold < 1));
    // The bet lines the message prints are the tool's, in menu order.
    assert.equal(message.split('\n').filter((line) => /^[A-H] {2}(bet|all-in).*est\. folds/.test(line)).length, options.length);

    // brief-0 of the same spot has none of it.
    const old = renderUserMessage({ ctx, brief: buildBrief(ctx, 'full', 'brief-0'), handNumber: 1, notes: [] });
    assert.ok(!/est\. folds|folds by bet size|stack-off|hands shown/.test(old));
  }
  assert.ok(withShown > 0);
});

test('prompt v1.2 renders brief-1 word for word, with the line model\'s fold estimates (and river gains) in the menu', () => {
  const masked = (message: string) => message.replace(/est\. folds (\d+%|<1%)/g, 'est. folds X').replace(/gain vs check [^\n]*/g, 'gain X');
  let moved = 0;
  for (const spot of HU_UNOPENED) {
    const input = buildBotTurnInput(spot.room, spot.botId, undefined, spot.ledger)!;
    const render = (foldModel: 'size' | 'line') => {
      const ctx = createToolContext(input, { foldModel });
      return renderUserMessage({ ctx, brief: buildBrief(ctx, 'full', 'brief-1'), handNumber: 1, notes: [], format: 'brief-1' });
    };
    const size = render('size');
    const line = render('line');
    assert.equal(masked(line), masked(size));
    // The default is the size-only model, the one v1.1 shows.
    const ctx = createToolContext(input);
    assert.equal(renderUserMessage({ ctx, brief: buildBrief(ctx, 'full', 'brief-1'), handNumber: 1, notes: [], format: 'brief-1' }), size);
    moved += line === size ? 0 : 1;
  }
  // The random ledgers hold bets by line, so the v1.2 numbers differ from v1.1's and the permutation test above covers them.
  assert.ok(moved >= HU_UNOPENED.length / 2, `${moved}`);
});

test('at a bigger table brief-1 keeps the brief-0 lines for prices, folds and the menu, and only rewords the hand rank', () => {
  const multiway = CANDIDATES.filter((spot) => spot.room.hand!.phase !== 'betting_preflop' && buildBotTurnInput(spot.room, spot.botId)!.context.opponentCount >= 2).slice(0, 4);
  assert.equal(multiway.length, 4);
  for (const spot of multiway) {
    const input = buildBotTurnInput(spot.room, spot.botId, undefined, spot.ledger)!;
    const ctx = createToolContext(input);
    const render = (format: 'brief-0' | 'brief-1') => renderUserMessage({ ctx, brief: buildBrief(ctx, 'full', format), handNumber: 1, notes: [], format });
    assert.equal(render('brief-1').replace(/bottom \d+%/, 'top XX%').replace(/top \d+%/, 'top XX%'), render('brief-0').replace(/top \d+%/, 'top XX%'));
  }
});
