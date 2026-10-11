'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { HandState } from '@aipoker/shared';
import {
  recordHandSummary,
  summarizeFinishedHand,
  type HandLogSummary,
} from '../../lib/hand-log-history';
import type { HandLogResultInput } from '../../lib/hand-log-model';

/**
 * Module-level store so the column and the mobile sheet (separate SidePanel
 * instances, one of them often unmounted) share the same finished-hand list.
 */
let history: readonly HandLogSummary[] = [];
const listeners = new Set<() => void>();
const EMPTY: readonly HandLogSummary[] = [];

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function record(summary: HandLogSummary) {
  const next = recordHandSummary(history, summary);
  if (next === history) return;
  history = next;
  for (const listener of listeners) listener();
}

/** Records the hand once its result is on screen and returns all remembered finished hands. */
export function useHandLogHistory(hand: HandState | null, result: HandLogResultInput | null): readonly HandLogSummary[] {
  useEffect(() => {
    if (hand && result && hand.phase === 'hand_end') {
      record(summarizeFinishedHand(hand, result));
    }
  }, [hand, result]);

  return useSyncExternalStore(subscribe, () => history, () => EMPTY);
}
