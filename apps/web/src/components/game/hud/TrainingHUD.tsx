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
    <div className="relative h-1.5 w-full rounded-full bg-[var(--color-bg-deep)] overflow-hidden">
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
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className={cn(
            'w-[200px] rounded-2xl overflow-hidden',
            'bg-[var(--color-glass-heavy)] backdrop-blur-xl',
            'border border-white/8',
            className,
          )}
          style={{ boxShadow: 'var(--shadow-panel)' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
            onClick={onToggle}
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] shadow-[0_0_6px_var(--color-success)]" />
              <span className="text-[12px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                训练提示
              </span>
            </div>
            <span className="text-[var(--color-text-dim)] text-[11px]">📊</span>
          </div>

          {/* Stats Body */}
          <div className="px-4 pb-4 flex flex-col gap-3">
            {/* 手牌强度 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-text-muted)]">手牌强度</span>
                <span className="font-chips text-[12px] font-semibold text-[var(--color-text-primary)]">
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
                  <span className="text-[11px] text-[var(--color-text-muted)]">底池赔率</span>
                  <span className="font-chips text-[12px] font-semibold text-[var(--color-text-primary)]">
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
              <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-[var(--color-bg-deep)]/60">
                <span className="text-[10px] text-[var(--color-text-muted)]">需要胜率 &gt;</span>
                <span className="font-chips text-[11px] font-semibold text-[var(--color-text-secondary)]">
                  {Math.round(computedPotOdds * 100)}%
                </span>
              </div>
            )}

            {/* 分隔 */}
            <div className="h-px bg-white/5" />

            {/* 位置 */}
            {data?.position && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-text-muted)]">位置</span>
                <span className="text-[12px] font-semibold text-[var(--color-text-primary)] px-2 py-0.5 rounded-md bg-[var(--color-bg-elevated)]">
                  {data.position}
                </span>
              </div>
            )}

            {/* 建议 */}
            {suggestionCfg && (
              <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl', suggestionCfg.bg)}>
                <span>{suggestionCfg.icon}</span>
                <div className="flex flex-col">
                  <span className={cn('text-[12px] font-semibold', suggestionCfg.color)}>
                    {suggestionCfg.label}
                  </span>
                  {data?.suggestionReason && (
                    <span className="text-[10px] text-[var(--color-text-muted)] leading-tight mt-0.5">
                      {data.suggestionReason}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 展开：详细说明 */}
            <Collapsible.Root open={expanded} onOpenChange={setExpanded}>
              <Collapsible.Trigger className="flex items-center gap-1 text-[10px] text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] transition-colors cursor-pointer select-none">
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
                      className="mt-2 text-[11px] text-[var(--color-text-muted)] leading-relaxed overflow-hidden"
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
