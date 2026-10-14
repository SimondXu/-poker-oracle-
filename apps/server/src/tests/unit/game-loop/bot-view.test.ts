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

/** Every tool call deep mode could make here, plus both briefs: everything a prompt can be built from. */
function everythingTheBotSees(input: BotTurnInput, seedBase = input.seedBase) {
  const ctx = createToolContext({ ...input, seedBase });
  const seats = (input.context.opponents ?? []).map((opponent) => ctx.seatOf(opponent.id));
  const calls: Array<[ToolName, ToolArgs]> = [
    ['equity', { seat: null, option: null }],
    ['preflop_chart', { seat: null, option: null }],
    ['advisor', { seat: null, option: null }],
    ...seats.flatMap((seat): Array<[ToolName, ToolArgs]> => [
      ['equity', { seat, option: null }],
      ['opponent_profile', { seat, option: null }],
      ['opponent_range', { seat, option: null }],
    ]),
    ...buildMenu(input.context).filter((option) => option.potShare !== null)
      .map((option): [ToolName, ToolArgs] => ['own_range', { seat: null, option: option.id }]),
  ];
  const messages = (['full', 'minimal'] as const).map((kind) =>
    renderUserMessage({ ctx, brief: buildBrief(ctx, kind), handNumber: input.handNumber, notes: [] }));
  const tools = calls.map(([name, args]) => {
    const run = runTool(ctx, name, args);
    return { tool: run.tool, args: run.args, ok: run.ok, error: run.error, result: run.result };
  });
  return { messages, tools };
}

function seen(spot: BotSpot): string {
  const input = buildBotTurnInput(spot.room, spot.botId);
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

test('prompts and tool outputs are unchanged when hidden cards, the deck and room.coach* are permuted', () => {
  assert.equal(SPOTS.length, 16);
  for (const [index, spot] of SPOTS.entries()) {
    const permuted = permuteHidden(spot.room, spot.botId, `hidden-${index}`);
    assert.notDeepEqual(permuted.hand!.deck, spot.room.hand!.deck);
    assert.equal(seen({ room: permuted, botId: spot.botId }), seenBefore(spot), `spot ${index}`);
  }
});

test("the permutation check would catch a leak: the bot's own cards do change what it sees", () => {
  const spot = SPOTS[0]!;
  const room = structuredClone(spot.room);
  const self = room.hand!.players.find((player) => player.id === spot.botId)!;
  const swapIndex = room.hand!.deck.findIndex((card) => !self.holeCards.includes(card));
  [self.holeCards[0], room.hand!.deck[swapIndex]] = [room.hand!.deck[swapIndex]!, self.holeCards[0]!];
  assert.notEqual(seen({ room, botId: spot.botId }), seenBefore(spot));
});

test('no player id or name appears in any prompt or tool output', () => {
  for (const spot of SPOTS) {
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
    const input = buildBotTurnInput(spot.room, spot.botId)!;
    assert.deepEqual(everythingTheBotSees(input), everythingTheBotSees(buildBotTurnInput(spot.room, spot.botId)!));
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
