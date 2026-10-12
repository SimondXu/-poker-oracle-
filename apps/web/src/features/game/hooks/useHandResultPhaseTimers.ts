'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { HandResultPhaseTimeline } from '../lib/table-animation';
import type { HandResult } from '@/stores/gameStore';

export function useHandResultPhaseTimers(
  setHandResultPhase: (phase: HandResult['phase']) => void,
) {
  const phaseTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearPhaseTimers = useCallback(() => {
    for (const timer of phaseTimersRef.current) {
      clearTimeout(timer);
    }
    phaseTimersRef.current = [];
  }, []);

  const schedulePhaseTimers = useCallback((timeline: HandResultPhaseTimeline) => {
    clearPhaseTimers();
    const at = (phase: HandResult['phase'], delayMs: number) =>
      phaseTimersRef.current.push(setTimeout(() => setHandResultPhase(phase), delayMs));
    if (timeline.revealingMs !== null) at('revealing', timeline.revealingMs);
    at('showing', timeline.showingMs);
    at('done', timeline.doneMs);
  }, [clearPhaseTimers, setHandResultPhase]);

  useEffect(() => clearPhaseTimers, [clearPhaseTimers]);

  return { clearPhaseTimers, schedulePhaseTimers };
}
