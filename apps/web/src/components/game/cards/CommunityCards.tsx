'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayingCard } from './PlayingCard';
import { buildCommunityRevealSteps } from '@/features/game/lib/table-animation';
import { cn } from '@/lib/utils';

interface CommunityCardsProps {
  cards: string[];   // 0–5 张公共牌
  winnerCards?: string[];  // 赢牌手牌（highlight 用）
  className?: string;
}

export const CommunityCards = memo(function CommunityCards({
  cards,
  winnerCards = [],
  className,
}: CommunityCardsProps) {
  const [visibleCards, setVisibleCards] = useState(cards);
  const isFirstRenderRef = useRef(true);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    for (const timer of timersRef.current) {
      clearTimeout(timer);
    }
    timersRef.current = [];

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      setVisibleCards(cards);
      return;
    }

    setVisibleCards((currentVisibleCards) => {
      if (cards.length <= currentVisibleCards.length) {
        return cards;
      }

      const steps = buildCommunityRevealSteps(currentVisibleCards.length, cards.length);
      for (const step of steps) {
        const timer = setTimeout(() => {
          setVisibleCards(cards.slice(0, step.count));
        }, step.delayMs);
        timersRef.current.push(timer);
      }

      return currentVisibleCards;
    });

    return () => {
      for (const timer of timersRef.current) {
        clearTimeout(timer);
      }
      timersRef.current = [];
    };
  }, [cards]);

  const slots = Array.from({ length: 5 }, (_, i) => visibleCards[i] ?? null);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <AnimatePresence initial={false}>
        {slots.map((card, i) => (
          <motion.div
            key={`slot-${i}-${card ?? 'empty'}`}
            initial={false}
            animate={
              card
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0.2, y: 0, scale: 1 }
            }
            transition={{
              type: 'spring',
              stiffness: 240,
              damping: 24,
            }}
          >
            {card ? (
              <PlayingCard
                card={card}
                size="lg"
                highlight={winnerCards.includes(card)}
                animateDeal
                dealDelay={0}
                dealFromX={(i - 2) * 12}
                dealFromY={-144}
              />
            ) : (
              /* 空牌槽位（占位） */
              <div
                className="rounded-[var(--radius-card)] border border-dashed border-white/8 opacity-20"
                style={{ width: 72, height: 104 }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});
