import { evaluatePreflopPercentile } from '@aipoker/strategy-engine';
import {
  buildBotPositionMap,
  formatBotPositionLabel,
  type BotPosition,
  type CoachAdvice,
  type HandState,
} from '@aipoker/shared';

/** What the Coach tab and hint show. The numbers come from the server's advice; nothing is estimated here. */
export interface CoachData {
  /** Display position, e.g. "BTN". */
  position?: string;
  /** Preflop: the hand's top-percent rank (0.08 = top 8%), a table lookup. */
  handPercentile?: number;
  /** It is the hero's turn; the advice may still be on its way. */
  heroTurn: boolean;
  /** The server's advice for the hero's open decision. */
  advice?: CoachAdvice;
}

const BETTING_PHASES = new Set(['betting_preflop', 'betting_flop', 'betting_turn', 'betting_river']);
const OUT_OF_HAND = new Set(['folded', 'out', 'sitting_out']);

function buildPositionMap(hand: HandState): Map<number, BotPosition> {
  return buildBotPositionMap(
    hand.players
      .filter((player) => player.status !== 'out' && player.status !== 'sitting_out')
      .map((player) => player.seatIndex),
    hand.buttonMarkerSeat,
  );
}

/** Heads-up the button posts the small blind and acts first before the flop, so call it SB there. */
function getDisplayPosition(position: BotPosition, hand: HandState): BotPosition {
  const seated = hand.players.filter((player) => player.status !== 'out' && player.status !== 'sitting_out').length;
  return seated === 2 && position === 'btn' && hand.phase === 'betting_preflop' ? 'sb' : position;
}

export function getPositionLabelForSeat(hand: HandState | null, seatIndex: number | undefined): string | undefined {
  if (!hand || seatIndex === undefined) {
    return undefined;
  }

  const position = buildPositionMap(hand).get(seatIndex);
  return position ? formatBotPositionLabel(getDisplayPosition(position, hand)) : undefined;
}

/** Coach data while the hero is live in a betting round with cards; the advice only on their turn. */
export function getCoachData(input: {
  currentUserId: string;
  hand: HandState | null;
  advice: CoachAdvice | null;
  isMyTurn: boolean;
}): CoachData | undefined {
  const hand = input.hand;
  const hero = hand?.players.find((player) => player.id === input.currentUserId);
  if (!hand || !hero || OUT_OF_HAND.has(hero.status) || hero.holeCards.length < 2 || !BETTING_PHASES.has(hand.phase)) {
    return undefined;
  }

  const position = getPositionLabelForSeat(hand, hero.seatIndex);
  return {
    heroTurn: input.isMyTurn,
    ...(position ? { position } : {}),
    ...(hand.phase === 'betting_preflop' ? { handPercentile: evaluatePreflopPercentile(hero.holeCards) } : {}),
    ...(input.isMyTurn && input.advice ? { advice: input.advice } : {}),
  };
}
