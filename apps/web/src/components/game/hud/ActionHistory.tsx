'use client';

import { memo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatChips } from '@/lib/utils';
import type { GameAction } from '@aipoker/shared';

interface ActionHistoryProps {
  actions: GameAction[];
  className?: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  fold:     { label: '弃牌',   color: 'text-[var(--color-error)]' },
  check:    { label: '过牌',   color: 'text-[var(--color-text-muted)]' },
  call:     { label: '跟注',   color: 'text-[var(--color-text-secondary)]' },
  bet:      { label: '下注',   color: 'text-[var(--color-gold)]' },
  raise_to: { label: '加注',   color: 'text-[var(--color-gold)]' },
  all_in:   { label: '全压',   color: 'text-[var(--color-success)]' },
};

const PHASE_LABELS: Record<string, string> = {
  betting_preflop: 'Pre',
  betting_flop:    'Flop',
  betting_turn:    'Turn',
  betting_river:   'River',
};

export const ActionHistory = memo(function ActionHistory({
  actions,
  className,
}: ActionHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 有新动作时自动滚动到最右
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [actions.length]);

  if (actions.length === 0) return null;

  // 按街分组
  const grouped = actions.reduce<Record<string, GameAction[]>>((acc, action) => {
    const phase = PHASE_LABELS[action.phase] ?? action.phase;
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(action);
    return acc;
  }, {});

  return (
    <div
      className={cn(
        'flex items-center gap-0 overflow-x-auto scrollbar-none',
        'px-4 py-3 sm:px-5',
        className,
      )}
      ref={scrollRef}
    >
      {Object.entries(grouped).map(([phase, phaseActions], gi) => (
        <div key={phase} className="flex items-center shrink-0">
          {/* 分隔符 */}
          {gi > 0 && (
            <div className="mx-2.5 h-4 w-px shrink-0 bg-white/12" />
          )}

          {/* 街名称 */}
          <span className="mr-2 shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
            {phase}
          </span>

          {/* 该街动作 */}
          <AnimatePresence>
            {phaseActions.map((action, i) => {
              const cfg = ACTION_LABELS[action.type] ?? { label: action.type, color: 'text-white' };
              return (
                <motion.div
                  key={action.sequenceNum}
                  initial={{ opacity: 0, x: 8, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  className="flex items-center shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1"
                >
                  <span className="text-[12px] text-[var(--color-text-secondary)]">
                    {action.playerName}
                  </span>
                  <span className={cn('ml-1 text-[12px] font-medium', cfg.color)}>
                    {cfg.label}
                    {action.amount > 0 && (
                      <span className="ml-0.5 font-chips text-[12px]">{formatChips(action.amount)}</span>
                    )}
                  </span>
                  {i < phaseActions.length - 1 && (
                    <span className="mx-2 text-[11px] text-[var(--color-text-dim)]">·</span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
});
