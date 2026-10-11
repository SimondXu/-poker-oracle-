'use client';

import { useMemo } from 'react';
import { selectHand, useGameStore } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';
import { getHeroContext, type HeroContext } from '../../lib/action-bar-preaction';

/**
 * Hero's stack, street bet and live status. ActionBarProps does not carry
 * these, and sizing / pre-actions / "Call (All-in)" need them, so read them
 * from the stores the rest of the game screen already uses.
 */
export function useHeroContext(): HeroContext | null {
  const userId = useAuthStore((state) => state.user?.id);
  const hand = useGameStore(selectHand);
  return useMemo(() => getHeroContext(hand, userId), [hand, userId]);
}
