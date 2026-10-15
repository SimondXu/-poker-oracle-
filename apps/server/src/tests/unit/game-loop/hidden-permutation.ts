import type { Card, CoachAdvice, CoachReviewRecord } from '@aipoker/shared';
import { createStableAnalysisRng } from '@aipoker/strategy-engine';

import type { CoachHandReview, RuntimeRoom } from '../../../rooms/types.ts';

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
export function permuteHidden(room: RuntimeRoom, botId: string, seed: string): RuntimeRoom {
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
    permuted.coachRecords.set(player.id, [{ holeCards: cards } as unknown as CoachReviewRecord]);
    permuted.coachReviews.set(player.id, { decisions: [{ holeCards: cards }] } as unknown as CoachHandReview);
    permuted.coachSessions.set(player.id, { matched: Math.floor(rng() * 9), close: 1, off: 2 } as never);
  }
  return permuted;
}
