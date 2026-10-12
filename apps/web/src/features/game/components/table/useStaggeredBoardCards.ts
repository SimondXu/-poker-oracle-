'use client';

import { useEffect, useRef, useState } from 'react';
import { buildCommunityRevealSteps } from '@/features/game/lib/table-animation';

/**
 * Reveals newly dealt board cards one beat at a time (same timeline as v1
 * CommunityCards). The first render shows the board as-is.
 */
export function useStaggeredBoardCards(cards: readonly string[]): readonly string[] {
  const [visibleCards, setVisibleCards] = useState(cards);
  const isFirstRenderRef = useRef(true);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clearTimers = () => {
      for (const timer of timersRef.current) {
        clearTimeout(timer);
      }
      timersRef.current = [];
    };
    clearTimers();

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      setVisibleCards(cards);
      return;
    }

    setVisibleCards((current) => {
      if (cards.length <= current.length) {
        return cards;
      }
      for (const step of buildCommunityRevealSteps(current.length, cards.length)) {
        timersRef.current.push(setTimeout(() => setVisibleCards(cards.slice(0, step.count)), step.delayMs));
      }
      return current;
    });

    return clearTimers;
  }, [cards]);

  return visibleCards;
}
