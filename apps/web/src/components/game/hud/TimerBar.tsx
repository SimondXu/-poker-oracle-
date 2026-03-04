'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TimerBarProps {
  durationMs: number;
  startedAt: number;   // Date.now() 记录的开始时间
  isActive: boolean;
  onExpire?: () => void;
  className?: string;
}

export const TimerBar = memo(function TimerBar({
  durationMs,
  startedAt,
  isActive,
  onExpire,
  className,
}: TimerBarProps) {
  const [remaining, setRemaining] = useState(durationMs);
  const rafRef = useRef<number>(0);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!isActive) {
      setRemaining(durationMs);
      expiredRef.current = false;
      return;
    }

    expiredRef.current = false;

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const rem = Math.max(0, durationMs - elapsed);
      setRemaining(rem);

      if (rem <= 0) {
        if (!expiredRef.current) {
          expiredRef.current = true;
          onExpire?.();
        }
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, startedAt, durationMs, onExpire]);

  const progress = remaining / durationMs; // 1→0
  const secondsLeft = Math.ceil(remaining / 1000);
  const isUrgent = progress < 0.25;
  const isCritical = progress < 0.1;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* 进度条 */}
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-deep)]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full origin-left"
          style={{
            width: '100%',
            scaleX: progress,
            background: isCritical
              ? 'var(--color-error)'
              : isUrgent
                ? 'linear-gradient(90deg, var(--color-warning), var(--color-error))'
                : 'linear-gradient(90deg, var(--color-success), var(--color-gold))',
            boxShadow: isCritical
              ? '0 0 8px var(--color-error)'
              : isUrgent
                ? '0 0 6px var(--color-warning)'
                : 'none',
          }}
          transition={{ duration: 0.05 }}
        />
      </div>

      {/* 秒数 */}
      <span
        className={cn(
          'w-9 text-right font-chips text-[13px] font-semibold leading-none transition-colors',
          isCritical ? 'text-[var(--color-error)]' :
          isUrgent   ? 'text-[var(--color-warning)]' :
                       'text-[var(--color-text-secondary)]',
          isCritical && 'animate-[seat-pulse_0.8s_ease-in-out_infinite]',
        )}
      >
        {secondsLeft}s
      </span>
    </div>
  );
});
