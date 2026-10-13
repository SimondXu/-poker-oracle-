import type { PlayerActionInput } from '@aipoker/game-engine';
import { classifyAction, gradeDecision, type CoachHeroAction, type GameReviewEvent } from '@aipoker/shared';

import type { RuntimeRoom } from '../rooms/types.ts';
import { prepareDecisionAdvice } from '../ws/view-models/hero-coach.ts';

/**
 * Grades a human's action against the advice for their open decision and keeps it for the hand's
 * review. Call it with the room still in the state before the action, after the engine accepted it.
 * It reads what it needs then and returns the function that builds the advice, grades the action and
 * records it: call that once the client has its ack and the new state, in the same tick and before
 * the hand's review is taken. Records are kept whether or not the coach is on, and whether or not
 * the advice was sent yet. Null when there is nothing to record.
 */
export function captureCoachDecision(room: RuntimeRoom, action: PlayerActionInput, source: CoachHeroAction['source']): (() => void) | null {
  const hero = room.hand?.players.find((player) => player.id === action.playerId);
  const buildAdvice = hero ? prepareDecisionAdvice(room, hero.id) : null;
  if (!room.hand || !hero || !buildAdvice) {
    return null;
  }

  // A raise to everything behind is the all-in the policy would call it.
  const allIn = action.type === 'raise_to' && action.amount === hero.streetCommitted + hero.stack;
  const kind = classifyAction(allIn ? { type: 'all_in' } : action, {
    currentBetToMatch: room.hand.betting.currentBetToMatch,
    myStreetCommitted: hero.streetCommitted,
    myStack: hero.stack,
  });
  const to = action.type === 'raise_to' ? action.amount : kind === 'all_in' ? hero.streetCommitted + hero.stack : undefined;
  const heroAction: CoachHeroAction = { kind, ...(to !== undefined ? { to } : {}), source };
  return () => {
    const advice = buildAdvice();
    if (!advice) {
      return;
    }
    const records = room.coachRecords.get(hero.id) ?? [];
    records.push({ street: advice.street, advice, heroAction, verdict: gradeDecision(advice, heroAction) });
    room.coachRecords.set(hero.id, records);
  };
}

/** A player who has left the room takes their coach state with them; a mere disconnect keeps it for the reconnect. */
export function forgetCoachPlayer(room: RuntimeRoom, playerId: string): void {
  room.coachAdvice.delete(playerId);
  room.coachRecords.delete(playerId);
  room.coachSessions.delete(playerId);
  room.coachReviews.delete(playerId);
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
