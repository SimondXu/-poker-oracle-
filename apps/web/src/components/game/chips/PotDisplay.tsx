'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatChips } from '@/lib/utils';
import type { Pot } from '@aipoker/shared';

interface PotDisplayProps {
  pots: Pot[];
  isWinning?: boolean;  // 触发赢牌动画
  className?: string;
}

export const PotDisplay = memo(function PotDisplay({
  pots,
  isWinning = false,
  className,
}: PotDisplayProps) {
  const totalPot = pots.reduce((sum, p) => sum + p.amount, 0);

  if (totalPot === 0) return null;

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      {/* 总底池 */}
      <motion.div
        className={cn(
          'flex items-center gap-2 px-4 py-1.5 rounded-full',
          'bg-[var(--color-glass-heavy)] border',
          isWinning
            ? 'border-[var(--color-gold)]/60 text-[var(--color-gold)]'
            : 'border-white/10 text-[var(--color-text-primary)]',
        )}
        animate={
          isWinning
            ? { scale: [1, 1.08, 1], boxShadow: ['0 0 0px transparent', 'var(--shadow-glow-gold)', '0 0 0px transparent'] }
            : { scale: 1, boxShadow: '0 0 0px transparent' }
        }
        transition={{ duration: 0.6, repeat: isWinning ? 2 : 0 }}
      >
        <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wider">底池</span>
        <span className="font-chips font-bold text-[16px]">{formatChips(totalPot)}</span>
      </motion.div>

      {/* 边池列表（超过1个时显示） */}
      <AnimatePresence>
        {pots.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-1.5 flex-wrap justify-center"
          >
            {pots.map((pot, i) => (
              <div
                key={i}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-bg-surface)] border border-white/8"
              >
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  {i === 0 ? '主池' : `边池${i}`}
                </span>
                <span className="font-chips text-[11px] text-[var(--color-gold)]">
                  {formatChips(pot.amount)}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
