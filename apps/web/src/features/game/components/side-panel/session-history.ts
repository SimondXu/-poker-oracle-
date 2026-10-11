'use client';

import { useSyncExternalStore } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { recordHandSummary, summarizeFinishedHand, type HandLogSummary } from '../../lib/hand-log-history';
import { observeHand, recordObservation, type HandObservation } from '../../lib/opponent-stats';
import { shouldShowWinnerIdentity } from '../../lib/table-animation';

/**
 * What this client has seen of the session: finished-hand summaries for the
 * log and per-hand observations for the opponent stats.
 *
 * The store lives at module level and listens to the game store itself, so a
 * hand is recorded even while the panel is collapsed or the mobile sheet is
 * closed (the panel component may not be mounted then). It is client-only
 * and starts the first time this module is imported in the browser.
 */
interface SessionHistory {
  hands: readonly HandLogSummary[];
  observations: readonly HandObservation[];
}

const EMPTY: SessionHistory = { hands: [], observations: [] };
let session: SessionHistory = EMPTY;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function update(next: SessionHistory) {
  if (next.hands === session.hands && next.observations === session.observations) return;
  session = next;
  for (const listener of listeners) listener();
}

function recordFromGameState(state: ReturnType<typeof useGameStore.getState>) {
  const { hand, handResult } = state;
  if (!hand || hand.phase !== 'hand_end') return;

  const observation = observeHand(hand);
  const observations = observation ? recordObservation(session.observations, observation) : session.observations;

  // The log only learns who won once the table has revealed it: no spoilers before showdown.
  const hands =
    handResult && shouldShowWinnerIdentity(handResult.phase)
      ? recordHandSummary(session.hands, summarizeFinishedHand(hand, handResult, useAuthStore.getState().user?.id))
      : session.hands;

  update({ hands, observations });
}

declare global {
  // Survives hot reloads so a re-evaluated module replaces the old listener instead of doubling it.
  var __aipokerSessionHistoryStop: (() => void) | undefined;
}

if (typeof window !== 'undefined') {
  globalThis.__aipokerSessionHistoryStop?.();
  recordFromGameState(useGameStore.getState());
  globalThis.__aipokerSessionHistoryStop = useGameStore.subscribe((state, previous) => {
    if (state.hand !== previous.hand || state.handResult !== previous.handResult) recordFromGameState(state);
  });
}

export function useHandHistory(): readonly HandLogSummary[] {
  return useSyncExternalStore(subscribe, () => session.hands, () => EMPTY.hands);
}

export function useHandObservations(): readonly HandObservation[] {
  return useSyncExternalStore(subscribe, () => session.observations, () => EMPTY.observations);
}
