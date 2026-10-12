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
