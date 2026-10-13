import { getValidActions } from '@aipoker/game-engine';
import type { CoachAdvice, GameCoachEvent, HandState as ClientHandState } from '@aipoker/shared';
import { buildCoachAdvice, type DecisionHand } from '@aipoker/strategy-engine';

import type { RuntimeRoom } from '../../rooms/types.ts';
import { buildViewerHand } from './viewer-hand.ts';

/**
 * Advice slower than this is logged, so its cost on the event loop can be watched. Twice the
 * measured multiway p95 (about 150 ms at 512 iterations), so routine multiway spots stay quiet.
 */
const SLOW_ADVICE_MS = 300;

/**
 * The hand as the hero was sent it, in the strategy engine's shape. Other players' hole cards are
 * already gone and there is no deck, so advice built from it can't use hidden information.
 */
export function toDecisionView(view: ClientHandState): DecisionHand {
  return {
    phase: view.phase,
    smallBlind: view.smallBlind,
    bigBlind: view.bigBlind,
    buttonMarkerSeat: view.buttonMarkerSeat,
    // As the engine counts it: every chip committed this hand, bets on the table included.
    potTotal: view.players.reduce((sum, player) => sum + player.handCommitted, 0),
    players: view.players,
    communityCards: view.communityCards,
    actions: view.actions,
    betting: view.betting,
  };
}

/** The current human actor's advice, or null for a bot, between actions, or if building it fails. */
export function buildHeroCoachEvent(room: RuntimeRoom): GameCoachEvent | null {
  const actor = room.hand?.players.find((player) => player.seatIndex === room.hand?.currentActorSeat);
  const advice = actor ? openDecisionAdvice(room, actor.id) : null;
  return actor && advice ? { roomId: room.id, playerId: actor.id, stateVersion: room.stateVersion, advice } : null;
}

type AdviceInput = Parameters<typeof buildCoachAdvice>[0];

/**
 * The advice for a human's open decision: the one already built for this state, or built now and
 * kept on the room, so the review grades the action against exactly what the hero was (or would
 * have been) sent.
 */
export function openDecisionAdvice(room: RuntimeRoom, heroId: string): CoachAdvice | null {
  const advice = prepareDecisionAdvice(room, heroId)?.() ?? null;
  if (advice) {
    room.coachAdvice.set(heroId, advice);
  }
  return advice;
}

/**
 * Reads what the open decision's advice needs now, and returns the function that builds it, so the
 * Monte Carlo can wait until the action is acknowledged. Run it in the same tick the room moves on
 * (the player stats, an input, change when the hand ends); it gives the advice the hero was or
 * would have been sent. Null when it is not a human's turn, or the inputs can't be read.
 */
export function prepareDecisionAdvice(room: RuntimeRoom, heroId: string): (() => CoachAdvice | null) | null {
  const kept = room.coachAdvice.get(heroId);
  if (kept && kept.stateVersion === room.stateVersion) {
    return () => kept;
  }

  const hand = room.hand;
  const actor = hand?.players.find((player) => player.seatIndex === hand.currentActorSeat);
  if (!hand || !actor || actor.id !== heroId || room.players.get(actor.id)?.isBot !== false) {
    return null;
  }

  let input: AdviceInput;
  try {
    const actionIndex = hand.actions.length;
    input = {
      view: toDecisionView(buildViewerHand(room, actor.id)),
      heroId: actor.id,
      valid: getValidActions(hand, actor.id),
      stats: room.playerStats,
      seed: `${room.id}:${room.handNumber}:${actor.id}:${actionIndex}`,
      keys: { handId: `${room.id}:${room.handNumber}`, actionIndex, stateVersion: room.stateVersion },
    };
  } catch (error) {
    console.error('coach advice failed', { roomId: room.id, playerId: actor.id, error });
    return null;
  }
  return () => buildAdvice(room.id, input);
}

function buildAdvice(roomId: string, input: AdviceInput): CoachAdvice | null {
  try {
    const started = performance.now();
    const advice = buildCoachAdvice(input);
    const elapsedMs = performance.now() - started;
    if (elapsedMs > SLOW_ADVICE_MS) {
      console.warn('slow coach advice', { roomId, street: advice?.street, opponents: advice?.opponents, elapsedMs: Math.round(elapsedMs) });
    }
    return advice;
  } catch (error) {
    // Advice is optional; the hero's turn must go on without it.
    console.error('coach advice failed', { roomId, playerId: input.heroId, error });
    return null;
  }
}
