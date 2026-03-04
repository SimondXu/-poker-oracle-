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

function getCommunityDealDelay(index: number, cardsLength: number): number {
  // 更接近真实桌面节奏：Flop 先停顿再连发，Turn/River 单张停顿略长
  if (cardsLength === 3 && index < 3) return 0.08 + index * 0.13;
  if (cardsLength === 4 && index === 3) return 0.18;
  if (cardsLength >= 5 && index === 4) return 0.18;
  return 0;
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
            key={`slot-${i}-${card ?? 'empty'}`}
            initial={{ opacity: 0, y: -18, scale: 0.9 }}
            animate={
              card
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 0, scale: 1 }
            }
            transition={{
              type: 'spring',
              stiffness: 220,
              damping: 23,
              delay: card ? getCommunityDealDelay(i, cards.length) : 0,
            }}
          >
            {card ? (
              <PlayingCard
                card={card}
                size="lg"
                highlight={winnerCards.includes(card)}
                animateDeal
                dealDelay={getCommunityDealDelay(i, cards.length)}
                dealFromX={(i - 2) * 12}
                dealFromY={-136}
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
