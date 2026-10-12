/**
 * Session stats for the Opponents tab, computed on the client from hands the
 * client actually saw (the server sends no stats). Pure; `opponent-stats.test.ts`
 * covers it.
 *
 * - VPIP: share of hands where the player voluntarily put chips in preflop
 *   (call, bet, raise, all-in). The big blind's free check does not count.
 * - PFR: share of hands where the player raised preflop.
 * - Aggression: postflop (bets + raises) / (bets + raises + calls + folds).
 *   Checks are not counted. `null` until the player has acted postflop.
 *
 * Everything is `null` until the player has been seen in MIN_HANDS_FOR_STATS
 * finished hands, so the UI shows "—" instead of a number from a tiny sample.
 */
import type { GameAction, HandState } from '@aipoker/shared';

export const MIN_HANDS_FOR_STATS = 5;

export interface PlayerHandObservation {
  /** Dealt into the hand (not eliminated or sitting out). */
  dealtIn: boolean;
  vpip: boolean;
  pfr: boolean;
  /** Postflop bets and raises. */
  aggressive: number;
  /** Postflop calls and folds. */
  passive: number;
}

export interface HandObservation {
  roomId: string;
  handNumber: number;
  players: Record<string, PlayerHandObservation>;
}

export interface OpponentStats {
  /** Finished hands the player was dealt into. */
  hands: number;
  /** 0..1, or `null` below MIN_HANDS_FOR_STATS. */
  vpip: number | null;
  pfr: number | null;
  /** 0..1, or `null` below MIN_HANDS_FOR_STATS or with no postflop decisions yet. */
  aggression: number | null;
}

function isPostflop(action: GameAction): boolean {
  return action.phase === 'betting_flop' || action.phase === 'betting_turn' || action.phase === 'betting_river';
}

/** Observation of one finished hand (`hand.phase === 'hand_end'`). Returns `null` for a hand that is still running. */
export function observeHand(hand: HandState): HandObservation | null {
  if (hand.phase !== 'hand_end') return null;

  const players: Record<string, PlayerHandObservation> = {};
  for (const player of hand.players) {
    players[player.id] = {
      dealtIn: player.status !== 'out' && player.status !== 'sitting_out',
      vpip: false,
      pfr: false,
      aggressive: 0,
      passive: 0,
    };
  }

  // Highest total any player had committed on the current street so far; a raise must beat it.
  let street: GameAction['phase'] | null = null;
  let toMatch = 0;
  const actions = [...hand.actions].sort((a, b) => a.sequenceNum - b.sequenceNum);
  for (const action of actions) {
    const observed = players[action.playerId];
    if (!observed) continue;
    const preflop = action.phase === 'betting_preflop';
    const postflop = isPostflop(action);
    if (!preflop && !postflop) continue;

    if (action.phase !== street) {
      street = action.phase;
      toMatch = preflop ? hand.bigBlind : 0;
    }

    const raises =
      action.type === 'bet' ||
      action.type === 'raise_to' ||
      (action.type === 'all_in' && action.toAmount > toMatch);
    if (raises) toMatch = Math.max(toMatch, action.toAmount);

    if (preflop) {
      if (action.type !== 'fold' && action.type !== 'check') observed.vpip = true;
      if (raises) observed.pfr = true;
    } else if (raises) {
      observed.aggressive += 1;
    } else if (action.type === 'call' || action.type === 'all_in' || action.type === 'fold') {
      observed.passive += 1;
    }
  }
  return { roomId: hand.roomId, handNumber: hand.handNumber, players };
}

/**
 * Add (or replace, keyed by handNumber) an observation. Switching room drops
 * the old room's hands. Returns the same array when nothing changed.
 */
export function recordObservation(
  observations: readonly HandObservation[],
  observation: HandObservation,
): readonly HandObservation[] {
  const sameRoom = observations.filter((entry) => entry.roomId === observation.roomId);
  const existing = sameRoom.find((entry) => entry.handNumber === observation.handNumber);
  if (existing && sameRoom.length === observations.length && JSON.stringify(existing) === JSON.stringify(observation)) {
    return observations;
  }
  return [...sameRoom.filter((entry) => entry.handNumber !== observation.handNumber), observation].sort(
    (a, b) => a.handNumber - b.handNumber,
  );
}

export function computeOpponentStats(
  observations: readonly HandObservation[],
  playerId: string,
  roomId: string | null,
): OpponentStats {
  let hands = 0;
  let vpip = 0;
  let pfr = 0;
  let aggressive = 0;
  let passive = 0;
  for (const observation of observations) {
    if (observation.roomId !== roomId) continue;
    const seen = observation.players[playerId];
    if (!seen?.dealtIn) continue;
    hands += 1;
    if (seen.vpip) vpip += 1;
    if (seen.pfr) pfr += 1;
    aggressive += seen.aggressive;
    passive += seen.passive;
  }

  if (hands < MIN_HANDS_FOR_STATS) return { hands, vpip: null, pfr: null, aggression: null };
  const decisions = aggressive + passive;
  return {
    hands,
    vpip: vpip / hands,
    pfr: pfr / hands,
    aggression: decisions > 0 ? aggressive / decisions : null,
  };
}
