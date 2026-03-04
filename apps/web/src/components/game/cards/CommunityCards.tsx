'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayingCard } from './PlayingCard';
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
  // 5个槽位：Flop(0-2) + Turn(3) + River(4)
  const slots = Array.from({ length: 5 }, (_, i) => cards[i] ?? null);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <AnimatePresence>
        {slots.map((card, i) => (
          <motion.div
            key={`slot-${i}`}
            initial={{ opacity: 0, y: -12, scale: 0.85 }}
            animate={
              card
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 0, scale: 1 }
            }
            transition={{
              type: 'spring',
              stiffness: 350,
              damping: 25,
              delay: card ? i * 0.06 : 0,
            }}
          >
            {card ? (
              <PlayingCard
                card={card}
                size="md"
                highlight={winnerCards.includes(card)}
                animateDeal
              />
            ) : (
              /* 空牌槽位（占位） */
              <div
                className="rounded-[var(--radius-card)] border border-dashed border-white/8 opacity-20"
                style={{ width: 56, height: 80 }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});
