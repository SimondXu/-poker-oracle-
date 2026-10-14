import type { HandPhase, HandState, PlayerActionInput } from '@aipoker/game-engine';
import {
  buildBotPositionMap,
  classifyAction,
  gradeDecision,
  type BotDecisionPhase,
  type CoachHeroAction,
  type CoachLineAction,
  type GameReviewEvent,
} from '@aipoker/shared';

import type { CoachHandReview, RuntimeRoom } from '../rooms/types.ts';
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
  const line = bettingLine(room.hand, hero.id);
  return () => {
    const advice = buildAdvice();
    if (!advice) {
      return;
    }
    const records = room.coachRecords.get(hero.id) ?? [];
    records.push({ street: advice.street, advice, heroAction, verdict: gradeDecision(advice, heroAction), line });
    room.coachRecords.set(hero.id, records);
  };
}

const STREETS: Partial<Record<HandPhase, BotDecisionPhase>> = {
  betting_preflop: 'preflop',
  betting_flop: 'flop',
  betting_turn: 'turn',
  betting_river: 'river',
};

/** The hand's actions so far, by position, each read as classifyAction reads the hero's. */
function bettingLine(hand: HandState, heroId: string): CoachLineAction[] {
  const positions = buildBotPositionMap(hand.players.map((player) => player.seatIndex), hand.buttonMarkerSeat);
  const seats = new Map(hand.players.map((player) => [player.id, player.seatIndex]));
  const line: CoachLineAction[] = [];
  let phase: HandPhase | null = null;
  let currentMax = 0;
  for (const action of hand.actions) {
    if (action.phase !== phase) {
      phase = action.phase;
      currentMax = phase === 'betting_preflop' ? hand.blinds.bigBlind : 0;
    }
    const street = STREETS[action.phase];
    const position = positions.get(seats.get(action.playerId) ?? -1);
    if (!street || !position) {
      continue;
    }

    // As captureCoachDecision reads the hero's action, from the state before this one.
    const allIn = action.type === 'raise_to' && action.addedAmount === action.stackBefore;
    const kind = classifyAction(allIn ? { type: 'all_in' } : action, {
      currentBetToMatch: currentMax,
      myStreetCommitted: action.toAmount - action.addedAmount,
      myStack: action.stackBefore,
    });
    const sized = kind === 'bet' || kind === 'raise' || kind === 'all_in';
    line.push({ street, position, isHero: action.playerId === heroId, kind, ...(sized ? { to: action.toAmount } : {}) });
    if ((action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax) {
      currentMax = action.toAmount;
    }
  }
  return line;
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
export function takeHandReviews(room: RuntimeRoom): CoachHandReview[] {
  if (room.hand?.phase !== 'hand_end') {
    return [];
  }

  const reviews: CoachHandReview[] = [];
  for (const [playerId, decisions] of room.coachRecords) {
    const session = room.coachSessions.get(playerId) ?? { matched: 0, close: 0, off: 0 };
    for (const decision of decisions) {
      session[decision.verdict] += 1;
    }
    room.coachSessions.set(playerId, session);
    const review: CoachHandReview = { roomId: room.id, playerId, handNumber: room.handNumber, decisions, session: { ...session } };
    room.coachReviews.set(playerId, review);
    reviews.push(review);
  }
  room.coachRecords.clear();
  room.coachAdvice.clear();
  return reviews;
}

/** The review as the client gets it: each decision without its betting line, which stays on the server. */
export function clientReview(review: CoachHandReview): GameReviewEvent {
  return { ...review, decisions: review.decisions.map(({ line, ...decision }) => (void line, decision)) };
}
