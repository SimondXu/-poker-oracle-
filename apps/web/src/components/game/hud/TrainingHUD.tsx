'use client';

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Collapsible from '@radix-ui/react-collapsible';
import { cn, calcPotOdds } from '@/lib/utils';

interface TrainingData {
  handStrength?: number;    // 0–1（百分位，如 0.18 = Top 18%）
  potOdds?: number;         // 0–1（如 0.28 = 28%）
  winRequirement?: number;  // 需要的胜率下限
  position?: string;        // 如 "BTN", "SB"
  suggestion?: 'call' | 'fold' | 'raise' | 'check';
  suggestionReason?: string;
}

interface TrainingHUDProps {
  data?: TrainingData;
  callAmount?: number;
  potTotal?: number;
  isVisible?: boolean;
  onToggle?: () => void;
  className?: string;
}

const SUGGESTION_CONFIG = {
  call:  { icon: '✅', label: '跟注/加注', color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success-dim)]' },
  fold:  { icon: '⚠️', label: '考虑弃牌', color: 'text-[var(--color-error)]',   bg: 'bg-[var(--color-error-dim)]' },
  raise: { icon: '⬆️', label: '考虑加注', color: 'text-[var(--color-gold)]',    bg: 'bg-[var(--color-gold-dim)]' },
  check: { icon: '✅', label: '过牌合理', color: 'text-[var(--color-success)]',  bg: 'bg-[var(--color-success-dim)]' },
};

/** 条形进度指示 */
function StatBar({ value, max = 1, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-deep)]">
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  );
}

export const TrainingHUD = memo(function TrainingHUD({
  data,
  callAmount = 0,
  potTotal = 0,
  isVisible = true,
  onToggle,
  className,
}: TrainingHUDProps) {
  const [expanded, setExpanded] = useState(false);

  const computedPotOdds = callAmount > 0 ? calcPotOdds(callAmount, potTotal) : (data?.potOdds ?? 0);
  const handStrength = data?.handStrength ?? 0;
  const suggestion = data?.suggestion;
  const suggestionCfg = suggestion ? SUGGESTION_CONFIG[suggestion] : null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 14 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className={cn(
            'w-full max-w-[296px] overflow-hidden rounded-2xl',
            'bg-[rgba(8,14,24,0.92)] backdrop-blur-xl',
            'border border-white/12',
            className,
          )}
          style={{ boxShadow: 'var(--shadow-panel), var(--shadow-hairline)' }}
        >
          {/* Header */}
          <div
            className={cn(
              'px-4 py-3.5 transition-colors',
              onToggle ? 'cursor-pointer hover:bg-white/5' : '',
            )}
            onClick={onToggle}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]" />
                <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                  训练提示
                </span>
              </div>
              <span className="text-[16px] text-[var(--color-text-dim)]">📊</span>
            </div>
            <div className="mt-2 h-px bg-white/6" />
          </div>

          {/* Stats Body */}
          <div className="flex flex-col gap-3.5 px-4 pb-4">
            {/* 手牌强度 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--color-text-muted)]">手牌强度</span>
                <span className="font-chips text-[14px] font-semibold text-[var(--color-text-primary)]">
                  {handStrength > 0 ? `Top ${Math.round(handStrength * 100)}%` : '—'}
                </span>
              </div>
              <StatBar
                value={1 - handStrength}
                color="linear-gradient(90deg, var(--color-error), var(--color-success))"
              />
            </div>

            {/* 底池赔率 */}
            {computedPotOdds > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[var(--color-text-muted)]">底池赔率</span>
                  <span className="font-chips text-[14px] font-semibold text-[var(--color-text-primary)]">
                    {Math.round(computedPotOdds * 100)}%
                  </span>
                </div>
                <StatBar
                  value={computedPotOdds}
                  color="var(--color-gold)"
                />
              </div>
            )}

            {/* 需要胜率 */}
            {computedPotOdds > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-[var(--color-bg-deep)]/60 px-2.5 py-1.5">
                <span className="text-[11px] text-[var(--color-text-muted)]">需要胜率 &gt;</span>
                <span className="font-chips text-[13px] font-semibold text-[var(--color-text-secondary)]">
                  {Math.round(computedPotOdds * 100)}%
                </span>
              </div>
            )}

            {/* 分隔 */}
            <div className="h-px bg-white/5" />

            {/* 位置 */}
            {data?.position && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--color-text-muted)]">位置</span>
                <span className="rounded-md bg-[var(--color-bg-elevated)] px-2 py-1 text-[12px] font-semibold text-[var(--color-text-primary)]">
                  {data.position}
                </span>
              </div>
            )}

            {/* 建议 */}
            {suggestionCfg && (
              <div className={cn('flex items-center gap-2 rounded-xl px-3 py-2.5', suggestionCfg.bg)}>
                <span>{suggestionCfg.icon}</span>
                <div className="flex flex-col">
                  <span className={cn('text-[13px] font-semibold', suggestionCfg.color)}>
                    {suggestionCfg.label}
                  </span>
                  {data?.suggestionReason && (
                    <span className="mt-0.5 text-[11px] leading-tight text-[var(--color-text-muted)]">
                      {data.suggestionReason}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 展开：详细说明 */}
            <Collapsible.Root open={expanded} onOpenChange={setExpanded}>
              <Collapsible.Trigger className="flex cursor-pointer select-none items-center gap-1.5 text-[12px] text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text-secondary)]">
                <motion.span
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={{ duration: 0.15 }}
                >
                  ▾
                </motion.span>
                {expanded ? '收起' : '详细说明'}
              </Collapsible.Trigger>

              <Collapsible.Content>
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 overflow-hidden text-[12px] leading-relaxed text-[var(--color-text-muted)]"
                    >
                      <p>当前底池赔率 {Math.round(computedPotOdds * 100)}%，你需要至少 {Math.round(computedPotOdds * 100)}% 的胜率才能使跟注 EV 为正。</p>
                      {handStrength > 0 && (
                        <p className="mt-1">
                          手牌强度 Top {Math.round(handStrength * 100)}%
                          {handStrength < computedPotOdds
                            ? '——手牌偏弱，谨慎跟注。'
                            : '——胜率充足，可以跟注/加注。'}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </Collapsible.Content>
            </Collapsible.Root>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
