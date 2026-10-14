import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSystemPrompt,
  emptyBotMemory,
  getPersona,
  PERSONA_IDS,
  renderNotes,
  updateBotMemory,
  type BotSessionMemory,
} from '@aipoker/agent-engine';
import { createStableAnalysisRng } from '@aipoker/strategy-engine';

import { buildBotHandEnd } from '../../../game-loop/bot-view.ts';
import type { RuntimeRoom } from '../../../rooms/types.ts';
import { seededFinishedHands } from '../../../tools/bot-spots.ts';
import { isShownAtShowdown } from '../../../ws/view-models/viewer-hand.ts';

const ROOMS = seededFinishedHands(60, 'bot-memory');
const BOT = [...ROOMS[0]!.players.keys()][0]!;

function remember(rooms: readonly RuntimeRoom[]): BotSessionMemory {
  return rooms.reduce((memory, room) => {
    const input = buildBotHandEnd(room, BOT);
    assert.ok(input);
    return updateBotMemory(memory, input);
  }, emptyBotMemory());
}

/** Re-deals every hole card nobody saw at the showdown (folded players', and the bot's own when it wasn't shown) from the unseen cards. */
function permuteUnshown(room: RuntimeRoom, seed: string): RuntimeRoom {
  const rng = createStableAnalysisRng(seed);
  const permuted = structuredClone(room);
  const hand = permuted.hand!;
  const unshown = hand.players.filter((player) => !isShownAtShowdown(hand, player.id));
  const pool = [...unshown.flatMap((player) => player.holeCards), ...hand.deck];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [pool[index], pool[other]] = [pool[other]!, pool[index]!];
  }
  for (const player of unshown) {
    player.holeCards = pool.splice(0, 2);
  }
  hand.deck = pool;
  return permuted;
}

test("memory is identical when folded players' cards and the bot's own unshown cards are permuted", () => {
  const memory = remember(ROOMS);
  const permuted = remember(ROOMS.map((room, index) => permuteUnshown(room, `unshown-${index}`)));
  assert.deepEqual(permuted, memory);

  // The corpus exercises the reducer: the bot folded, played lines, reached showdowns, and saw events.
  assert.equal(memory.handsSeen, 60);
  assert.ok(memory.ownPreflopFolds > 0);
  assert.ok(memory.own.length === 5);
  const events = [...memory.opponents.values()].flatMap((opponent) => opponent.notable.map((event) => event.kind));
  assert.ok(events.length >= 5, events.join());
});

test("the check would catch a leak: changing a shown hand does change memory", () => {
  const shownHand = remember(ROOMS).own.find((line) => line.showdown)!.hand;
  const shownIndex = ROOMS.findIndex((room) => room.handNumber === shownHand);
  const rooms = ROOMS.map((room) => structuredClone(room));
  const self = rooms[shownIndex]!.hand!.players.find((player) => player.id === BOT)!;
  const deck = rooms[shownIndex]!.hand!.deck;
  [self.holeCards[0], deck[0]] = [deck[0]!, self.holeCards[0]!];
  assert.notDeepEqual(remember(rooms), remember(ROOMS));
});

test('memory keeps no unshown cards, and NOTES and the system prompts name seats, never players', () => {
  const memory = remember(ROOMS);
  for (const line of memory.own) {
    const room = ROOMS.find((candidate) => candidate.handNumber === line.hand)!;
    assert.equal(line.shownCards !== null, isShownAtShowdown(room.hand!, BOT));
  }

  const seats = [2, 3, 4, 5, 6];
  const text = [
    ...PERSONA_IDS.map((id) => renderNotes(memory, {
      opponentSeats: seats,
      self: { hands: 60, preflopVoluntary: 14, preflopRaises: 9, preflopOversizedRaises: 0, postflopActions: 30, postflopAggressive: 9, postflopFacingBets: 10, postflopFoldsToBets: 4 },
      bands: getPersona(id).bands,
    }).join('\n')),
    ...PERSONA_IDS.map((id) => buildSystemPrompt(id, { deep: true, maxRounds: 3, withAdvisor: true })),
  ].join('\n');
  assert.match(text, /You this session: 60 hands · VPIP 23% \(target 17-26%\)/);
  assert.match(text, /Seat \d: /);
  for (const player of ROOMS[0]!.players.values()) {
    assert.ok(!text.includes(player.id) && !text.includes(player.name));
  }
});

test('a new occupant in a seat starts without the old impressions', () => {
  const memory = remember(ROOMS.slice(0, 40));
  const seat = [...memory.opponents.entries()].find(([, impressions]) => impressions.notable.length > 0)![0];
  const input = buildBotHandEnd(ROOMS[40]!, BOT)!;
  const moved = updateBotMemory(memory, { ...input, occupantKeys: new Map([...input.occupantKeys].map(([id, key]) => [id, `${key}-new`])) });
  assert.equal(moved.opponents.get(seat)!.handsTogether, 1);
  assert.ok(memory.opponents.get(seat)!.handsTogether > 1);
});
