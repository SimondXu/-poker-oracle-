'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { getSoundMuted, playSound, primeSounds, setSoundMuted, subscribeSoundMuted } from '../lib/sound';
import { createTableSoundTracker, type TableSoundSnapshot } from '../lib/table-sounds';

const toSnapshot = (state: ReturnType<typeof useGameStore.getState>): TableSoundSnapshot => ({
  hand: state.hand,
  hasValidActions: state.validActions !== null,
  timerStartedAt: state.timerStartedAt,
  timerDurationMs: state.timerDurationMs,
  resultPhase: state.handResult?.phase ?? null,
});

/** Plays the table sounds for what the game store shows. Mount once on the game page. */
export function useTableSounds() {
  useEffect(() => {
    const stopPriming = primeSounds();
    const tracker = createTableSoundTracker(playSound);
    tracker.update(toSnapshot(useGameStore.getState()));
    const unsubscribe = useGameStore.subscribe((state) => tracker.update(toSnapshot(state)));
    return () => {
      unsubscribe();
      tracker.dispose();
      stopPriming();
    };
  }, []);
}

/** Mute state for the top bar toggle (sound is on until the player turns it off). */
export function useSoundMuted() {
  const muted = useSyncExternalStore(subscribeSoundMuted, getSoundMuted, () => false);
  return { muted, setMuted: setSoundMuted };
}
