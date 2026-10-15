import { buildBrief, createToolContext, renderUserMessage, type Ledger, type PlayerLedger } from '@aipoker/agent-engine';
import { applyAction, initializeHand } from '@aipoker/game-engine';
import type { BotPlayerStats, Card } from '@aipoker/shared';

import { buildBotTurnInput } from '../../../game-loop/bot-view.ts';
import { createHeadsUpRoom } from '../../../tools/duplicate-hu.ts';
import { mulberry32 } from '../../../tools/eval-utils.ts';

/**
 * Heads-up rivers with chosen cards, stacks, history and opponent record: the bot ('a', seat 0, the
 * button) acts first before the flop and last after it; the opponent ('b', seat 1) is the big blind.
 */
type Step = readonly ['a' | 'b', 'check' | 'call' | 'fold'] | readonly ['a' | 'b', 'raise_to', number];

export interface ExampleSpot {
  stacks: readonly [number, number];
  /** Actions up to the bot's river decision. */
  script: readonly Step[];
  hole: readonly [Card, Card];
  board: readonly Card[];
  handNumber: number;
  opponentStats: BotPlayerStats;
  opponentLedger: Partial<PlayerLedger>;
}

const BLANK_LEDGER: PlayerLedger = {
  buckets: [{ faced: 0, folded: 0 }, { faced: 0, folded: 0 }, { faced: 0, folded: 0 }, { faced: 0, folded: 0 }],
  sumBase: 0,
  byLine: {},
  sawFlop: 0,
  showdowns: 0,
  lightCalldowns: 0,
  shown: [],
  notable: [],
};

export function exampleInput(spot: ExampleSpot) {
  const room = createHeadsUpRoom(['a', 'b'], new Map([['b', { ...spot.opponentStats }]]));
  room.smallBlind = 10;
  room.bigBlind = 20;
  room.handNumber = spot.handNumber;
  const initialized = initializeHand({
    players: [{ id: 'a', seatIndex: 0, stack: spot.stacks[0] }, { id: 'b', seatIndex: 1, stack: spot.stacks[1] }],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: mulberry32(1),
  });
  if (!initialized.ok) {
    throw new Error(initialized.error);
  }
  let hand = initialized.value;
  for (const [playerId, type, amount] of spot.script) {
    const applied = applyAction(hand, { playerId, type, ...(amount === undefined ? {} : { amount }) }, { timestamp: hand.actions.length + 1 });
    if (!applied.ok) {
      throw new Error(`${playerId} ${type}: ${applied.error}`);
    }
    hand = applied.value;
  }
  if (hand.phase !== 'betting_river' || hand.players.find((player) => player.seatIndex === hand.currentActorSeat)?.id !== 'a') {
    throw new Error(`The script ends in ${hand.phase}, not at the bot's river decision`);
  }

  // Chosen cards: nothing has been decided by them yet, so they can replace the dealt ones.
  const used = new Set<Card>([...spot.hole, ...spot.board]);
  const spare = hand.deck.filter((card) => !used.has(card));
  hand = {
    ...hand,
    communityCards: [...spot.board],
    deck: spare.slice(2),
    players: hand.players.map((player) => (player.id === 'a' ? { ...player, holeCards: [...spot.hole] } : { ...player, holeCards: spare.slice(0, 2) })),
  };
  room.hand = hand;

  const ledger: Ledger = { players: { b: { ...BLANK_LEDGER, ...spot.opponentLedger } } };
  return buildBotTurnInput(room, 'a', undefined, ledger)!;
}

export function renderExample(spot: ExampleSpot, format: 'brief-0' | 'brief-1' = 'brief-1'): string {
  const input = exampleInput(spot);
  const ctx = createToolContext(input);
  return renderUserMessage({ ctx, brief: buildBrief(ctx, 'full', format), handNumber: input.handNumber, notes: [], format });
}
