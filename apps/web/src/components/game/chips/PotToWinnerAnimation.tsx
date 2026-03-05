'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface PotToWinnerTarget {
  playerId: string;
  xPct: number;
  yPct: number;
}

interface PotToWinnerAnimationProps {
  targets: PotToWinnerTarget[];
  active: boolean;
  triggerKey: string;
}

export const PotToWinnerAnimation = memo(function PotToWinnerAnimation({
  targets,
  active,
  triggerKey,
}: PotToWinnerAnimationProps) {
  if (!active || targets.length === 0) return null;

  return (
    <div key={triggerKey} className="pointer-events-none absolute inset-0 z-[11]">
      {targets.map((target, index) => (
        <div key={`${target.playerId}-${index}`} className="absolute inset-0">
          <motion.div
            initial={{ left: '50%', top: '50%', opacity: 0, scale: 0.7, rotate: -8 }}
            animate={{
              left: `${target.xPct}%`,
              top: `${target.yPct}%`,
              opacity: [0, 1, 1, 0],
              scale: [0.7, 1.08, 1, 0.94],
              rotate: [-8, 4, -2, 0],
            }}
            transition={{
              duration: 0.6,
              delay: index * 0.05,
              times: [0, 0.2, 0.82, 1],
              ease: [0.16, 0.84, 0.32, 1],
            }}
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--color-gold)]/65 bg-[radial-gradient(circle_at_30%_30%,#fff9d5,#ffd84f_44%,#b38416)] shadow-[0_0_16px_rgba(255,215,0,0.75)]"
          />

          {Array.from({ length: 8 }, (_, particleIndex) => {
            const angle = (Math.PI * 2 * particleIndex) / 8;
            const dx = Math.cos(angle) * (32 + (particleIndex % 3) * 6);
            const dy = Math.sin(angle) * (22 + ((particleIndex + 1) % 3) * 8);

            return (
              <motion.span
                key={particleIndex}
                initial={{
                  left: `${target.xPct}%`,
                  top: `${target.yPct}%`,
                  opacity: 0,
                  scale: 0.3,
                }}
                animate={{
                  left: `calc(${target.xPct}% + ${dx}px)`,
                  top: `calc(${target.yPct}% + ${dy}px)`,
                  opacity: [0, 0.9, 0],
                  scale: [0.3, 1, 0.2],
                }}
                transition={{
                  duration: 0.38,
                  delay: index * 0.05 + 0.3,
                  ease: 'easeOut',
                }}
                className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-gold)] shadow-[0_0_8px_rgba(255,215,0,0.8)]"
              />
            );
          })}
        </div>
      ))}
    </div>
  );
});
