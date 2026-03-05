'use client';

import { memo, useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Collapsible from '@radix-ui/react-collapsible';
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
  const [expanded, setExpanded] = useState(true);

  // 有新动作时自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
    <Collapsible.Root
      open={expanded}
      onOpenChange={setExpanded}
      className={cn('action-history action-history--vertical w-full', className)}
    >
      <div className="action-history__header flex items-center justify-between border-b border-white/8 px-3 py-2.5">
        <div className="action-history__title-group flex items-center gap-2">
          <span className="action-history__title text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">
            行动历史
          </span>
          <span className="action-history__count rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)]">
            {actions.length}
          </span>
        </div>

        <Collapsible.Trigger className="action-history__toggle flex items-center gap-1.5 text-[11px] text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text-secondary)]">
          <motion.span
            className="action-history__toggle-caret"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.15 }}
          >
            ▾
          </motion.span>
          <span className="action-history__toggle-label">{expanded ? '收起' : '展开'}</span>
        </Collapsible.Trigger>
      </div>

      <Collapsible.Content className="action-history__content">
        <div
          className="action-history__scroller flex w-full max-h-[260px] flex-col gap-2.5 overflow-y-auto scrollbar-none px-3 py-3"
          ref={scrollRef}
        >
          {Object.entries(grouped).map(([phase, phaseActions], gi) => (
            <section
              key={phase}
              className={cn(
                'action-history__phase rounded-xl border border-white/8 bg-white/[0.02] p-2',
                gi > 0 && 'mt-0.5',
              )}
            >
              {/* 街分隔 */}
              {gi > 0 && (
                <div className="action-history__separator mb-2 h-px w-full bg-white/8" />
              )}

              {/* 街名称 */}
              <div className="action-history__phase-header mb-2 flex items-center justify-between">
                <span className="action-history__phase-title text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-dim)]">
                  {phase}
                </span>
                <span className="action-history__phase-count text-[10px] font-medium text-[var(--color-text-dim)]/70">
                  {phaseActions.length} 手
                </span>
              </div>

              {/* 该街动作 */}
              <div className="action-history__grid grid grid-cols-3 gap-1.5">
                <AnimatePresence>
                  {phaseActions.map((action) => {
                    const cfg = ACTION_LABELS[action.type] ?? { label: action.type, color: 'text-white' };
                    return (
                      <motion.article
                        key={action.sequenceNum}
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className={cn(
                          'action-history__item action-history__item--square',
                          'aspect-square min-h-0 rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] p-1.5',
                          'flex flex-col justify-between shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
                        )}
                      >
                        <div className="action-history__item-player truncate text-[10px] text-[var(--color-text-secondary)]">
                          {action.playerName}
                        </div>

                        <div className="action-history__item-main">
                          <span className={cn('action-history__item-action text-[11px] font-semibold', cfg.color)}>
                            {cfg.label}
                          </span>
                          {action.amount > 0 && (
                            <div className="action-history__item-amount mt-0.5 font-chips text-[10px] text-[var(--color-gold)]">
                              {formatChips(action.amount)}
                            </div>
                          )}
                        </div>

                        <div className="action-history__item-seq text-[9px] text-[var(--color-text-dim)]/80">
                          #{action.sequenceNum}
                        </div>
                      </motion.article>
                    );
                  })}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
});
