'use client';

import { useCallback, useEffect, useRef } from 'react';
import { getHandResultPhaseTimeline } from '../lib/table-animation';
import type { HandResult } from '@/stores/gameStore';

const HAND_RESULT_PHASE_TIMELINE = getHandResultPhaseTimeline();

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

  const schedulePhaseTimers = useCallback(() => {
    clearPhaseTimers();
    const revealTimer = setTimeout(() => {
      setHandResultPhase('showing');
    }, HAND_RESULT_PHASE_TIMELINE.announcingMs);
    const doneTimer = setTimeout(() => {
      setHandResultPhase('done');
    }, HAND_RESULT_PHASE_TIMELINE.doneMs);

    phaseTimersRef.current = [revealTimer, doneTimer];
  }, [clearPhaseTimers, setHandResultPhase]);

  useEffect(() => clearPhaseTimers, [clearPhaseTimers]);

  return { clearPhaseTimers, schedulePhaseTimers };
}
