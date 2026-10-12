import type { PlayerActionInput } from '@aipoker/game-engine';
import { classifyAction, gradeDecision, type CoachHeroAction, type GameReviewEvent } from '@aipoker/shared';

import type { RuntimeRoom } from '../rooms/types.ts';
import { openDecisionAdvice } from '../ws/view-models/hero-coach.ts';

/**
 * Grades a human's action against the advice for their open decision and keeps it for the hand's
 * review. Call it with the room still in the state before the action, after the engine accepted it.
 * Records are kept whether or not the coach is on, and whether or not the advice was sent yet.
 */
export function recordCoachDecision(room: RuntimeRoom, action: PlayerActionInput, source: CoachHeroAction['source']): void {
  const hero = room.hand?.players.find((player) => player.id === action.playerId);
  const advice = hero ? openDecisionAdvice(room, hero.id) : null;
  if (!room.hand || !hero || !advice) {
    return;
  }

  const kind = classifyAction(action, {
    currentBetToMatch: room.hand.betting.currentBetToMatch,
    myStreetCommitted: hero.streetCommitted,
    myStack: hero.stack,
  });
  const to = action.type === 'raise_to' ? action.amount : kind === 'all_in' ? hero.streetCommitted + hero.stack : undefined;
  const heroAction: CoachHeroAction = { kind, ...(to !== undefined ? { to } : {}), source };
  const records = room.coachRecords.get(hero.id) ?? [];
  records.push({ street: advice.street, advice, heroAction, verdict: gradeDecision(advice, heroAction) });
  room.coachRecords.set(hero.id, records);
}

/**
 * At hand end: each human's review of the hand with their session tally updated, kept for a reconnect.
 * The hand's records and advice are cleared, so a second call for the same hand returns nothing.
 */
export function takeHandReviews(room: RuntimeRoom): GameReviewEvent[] {
  if (room.hand?.phase !== 'hand_end') {
    return [];
  }

  const reviews: GameReviewEvent[] = [];
  for (const [playerId, decisions] of room.coachRecords) {
    const session = room.coachSessions.get(playerId) ?? { matched: 0, close: 0, off: 0 };
    for (const decision of decisions) {
      session[decision.verdict] += 1;
    }
    room.coachSessions.set(playerId, session);
    const review: GameReviewEvent = { roomId: room.id, playerId, handNumber: room.handNumber, decisions, session: { ...session } };
    room.coachReviews.set(playerId, review);
    reviews.push(review);
  }
  room.coachRecords.clear();
  room.coachAdvice.clear();
  return reviews;
}
