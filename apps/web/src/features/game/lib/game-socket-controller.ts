import { evaluateHandRanking, getHandRankDisplayName } from '../../../lib/hand-evaluator.ts';
import type { HandResult, PayoutInfo } from '../../../stores/gameStore.ts';
import type { HandResultEvent, HandState } from '@aipoker/shared';

export type NextHandRequestSource = 'manual' | 'auto' | 'hotkey';

export function mapHandResultToStore(input: {
  result: HandResultEvent;
  currentHand: HandState | null;
  /** Already-translated name for a payout winner the server and the hand snapshot do not name. */
  fallbackPlayerName: string;
}): HandResult {
  const communityCards = input.currentHand?.communityCards ?? [];
  const payoutsByPlayer = new Map<string, number>();

  for (const payout of input.result.payouts) {
    payoutsByPlayer.set(payout.playerId, (payoutsByPlayer.get(payout.playerId) ?? 0) + payout.amount);
  }

  const payoutInfos: PayoutInfo[] = [];
  for (const [playerId, amount] of payoutsByPlayer) {
    const resultPlayer = input.result.players.find((player) => player.id === playerId);
    const handPlayer = input.currentHand?.players.find((player) => player.id === playerId);
    const playerName = resultPlayer?.name ?? handPlayer?.name ?? input.fallbackPlayerName;
    const holeCards = resultPlayer?.holeCards ?? handPlayer?.holeCards ?? [];

    let handRankName = '';
    let bestCards: string[] = [];

    if (holeCards.length >= 2 && communityCards.length >= 5) {
      const evaluation = evaluateHandRanking(holeCards, communityCards);
      handRankName = getHandRankDisplayName(evaluation.category);
      bestCards = evaluation.bestCards;
    }

    payoutInfos.push({
      playerId,
      playerName,
      amount,
      handRankName,
      bestCards,
    });
  }

  return {
    payouts: payoutInfos,
    winnerIds: [...payoutsByPlayer.keys()],
    potTotal: input.result.potTotal,
    phase: 'announcing',
    table: input.result.table,
  };
}

/**
 * A game:state opens a new hand when it is a preflop betting state or belongs to a different hand
 * than the one in the store. The second case matters when a hand starts already at `hand_end`
 * (everyone all-in from the blinds): the previous hand's result must not carry over to it.
 */
export function startsNewHand(previous: HandState | null, next: HandState): boolean {
  if (next.phase === 'betting_preflop') {
    return true;
  }
  return previous !== null && (previous.id !== next.id || previous.handNumber !== next.handNumber);
}

export function canRequestNextHand(input: {
  enabled: boolean;
  roomId: string;
  nextHandRequested: boolean;
}): boolean {
  return input.enabled && Boolean(input.roomId) && !input.nextHandRequested;
}

export function shouldIgnoreNextHandError(source: NextHandRequestSource, error?: string): boolean {
  return source !== 'manual' && error === 'hand_already_started';
}

const BETTING_PHASES: ReadonlySet<HandState['phase']> = new Set([
  'betting_preflop',
  'betting_flop',
  'betting_turn',
  'betting_river',
]);

/**
 * The server closes a street (or the hand) in the same update as the action that closed it, so
 * that action and its chips would vanish before anyone sees them. Returns `previous` with just that
 * action applied, to show for a beat before `next`; `null` when `next` does not close a street right
 * after `previous` (same street, another hand, or updates missed in between).
 */
export function getStreetHoldHand(previous: HandState | null, next: HandState): HandState | null {
  if (!previous || previous.id !== next.id || previous.handNumber !== next.handNumber) return null;
  if (previous.phase === next.phase || !BETTING_PHASES.has(previous.phase)) return null;
  if (next.actions.length !== previous.actions.length + 1) return null;
  const closing = next.actions.at(-1);
  if (!closing || closing.phase !== previous.phase) return null;

  return {
    ...previous,
    currentActorSeat: null,
    actions: next.actions,
    players: previous.players.map((player) => {
      if (player.id !== closing.playerId) return player;
      const stack = Math.max(0, player.stack - closing.addedAmount);
      return {
        ...player,
        stack,
        streetCommitted: player.streetCommitted + closing.addedAmount,
        handCommitted: player.handCommitted + closing.addedAmount,
        status: closing.type === 'fold' ? 'folded' : stack === 0 ? 'all_in' : player.status,
      };
    }),
  };
}

/** Two or more players still in at hand end means cards are shown. */
export function isShowdownHand(hand: HandState | null): boolean {
  return Boolean(hand && hand.phase === 'hand_end' && hand.players.filter((player) => player.status === 'active' || player.status === 'all_in').length >= 2);
}
