'use client';

import { useMemo, useRef } from 'react';
import type { HandState } from '@aipoker/shared';
import {
  buildTableViewModel,
  shareTableViewModel,
  type TableViewModel,
} from '../lib/table-view-model';
import type { ResultAnimationPhase } from '../lib/table-animation';

export interface UseTableViewModelInput {
  hand: HandState | null;
  currentUserId: string;
  timerStartedAt: number | null;
  timerDurationMs: number;
  /** Raw store values; the builder gates them on handResultPhase. */
  winnerIds: readonly string[];
  winnerCards: readonly string[];
  winnerBestCardsByPlayer: Readonly<Record<string, readonly string[]>>;
  payoutAmountsByPlayer: Readonly<Record<string, number>>;
  handResultPhase: ResultAnimationPhase;
  isWinning: boolean;
}

/**
 * Memoized, structurally shared table view model. Seat / board / pot objects
 * keep their identity across renders while their content is unchanged, so
 * `memo` children only re-render when their own data changes.
 */
export function useTableViewModel(input: UseTableViewModelInput): TableViewModel | null {
  const {
    hand,
    currentUserId,
    timerStartedAt,
    timerDurationMs,
    winnerBestCardsByPlayer,
    payoutAmountsByPlayer,
    handResultPhase,
    isWinning,
  } = input;

  // Callers often pass fresh `[]` literals; key arrays by content instead of identity.
  const winnerIdsKey = input.winnerIds.join(',');
  const winnerCardsKey = input.winnerCards.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content
  const winnerIds = useMemo(() => input.winnerIds, [winnerIdsKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content
  const winnerCards = useMemo(() => input.winnerCards, [winnerCardsKey]);

  const previousRef = useRef<TableViewModel | null>(null);

  return useMemo(() => {
    if (!hand) {
      previousRef.current = null;
      return null;
    }

    const next = buildTableViewModel({
      hand,
      currentUserId,
      timerStartedAt,
      timerDurationMs,
      winnerIds,
      winnerCards,
      winnerBestCardsByPlayer,
      payoutAmountsByPlayer,
      handResultPhase,
      isWinning,
    });
    const shared = shareTableViewModel(previousRef.current, next);
    previousRef.current = shared;
    return shared;
  }, [
    hand,
    currentUserId,
    timerStartedAt,
    timerDurationMs,
    winnerIds,
    winnerCards,
    winnerBestCardsByPlayer,
    payoutAmountsByPlayer,
    handResultPhase,
    isWinning,
  ]);
}
