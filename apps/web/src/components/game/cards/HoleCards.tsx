'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayingCard } from './PlayingCard';
import { cn } from '@/lib/utils';

interface HoleCardsProps {
  cards: string[];       // 底牌数组
  faceDown?: boolean;    // 是否正面朝下
  highlight?: boolean;   // 赢牌高亮
  dim?: boolean;         // 输牌暗化
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const HoleCards = memo(function HoleCards({
  cards,
  faceDown = false,
  highlight = false,
  dim = false,
  size = 'lg',
  className,
}: HoleCardsProps) {
  if (cards.length === 0 && !faceDown) return null;

  // 有牌时展示，没有牌但 faceDown 时展示 2 张牌背
  const displayCards = cards.length > 0 ? cards : faceDown ? ['', ''] : [];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <AnimatePresence>
        {displayCards.map((card, i) => (
          <motion.div
            key={faceDown ? `back-${i}` : card || `empty-${i}`}
            initial={{ opacity: 0, x: -20, rotate: -10 }}
            animate={{ opacity: 1, x: 0, rotate: i === 0 ? -2 : 2 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24, delay: i * 0.08 }}
          >
            <PlayingCard
              {...(card ? { card } : {})}
              size={size}
              faceDown={faceDown || !card}
              highlight={highlight}
              dim={dim}
              animateDeal={!faceDown}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});
