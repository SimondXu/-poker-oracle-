'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface EliminatedChoicePanelProps {
  mode: 'decision' | 'spectating';
  isBotsOnlyContinuation?: boolean;
  onSpectate?: () => void;
  onBackToLobby: () => void;
  className?: string;
}

export const EliminatedChoicePanel = memo(function EliminatedChoicePanel({
  mode,
  isBotsOnlyContinuation = false,
  onSpectate,
  onBackToLobby,
  className,
}: EliminatedChoicePanelProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(
        'eliminated-choice-panel eliminated-choice-panel--glass w-full overflow-hidden rounded-2xl',
        'border border-[var(--color-gold)]/28',
        'bg-[linear-gradient(145deg,rgba(10,18,30,0.93),rgba(12,21,34,0.9)_54%,rgba(9,15,24,0.94))]',
        'px-4 py-3.5 shadow-[0_18px_42px_rgba(0,0,0,0.45),0_0_34px_rgba(255,215,0,0.12)]',
        className,
      )}
    >
      <div className="eliminated-choice-panel__header mb-3">
        <p className="eliminated-choice-panel__kicker text-[10px] uppercase tracking-[0.2em] text-[var(--color-gold-muted)]">
          Elimination
        </p>
        <h3 className="eliminated-choice-panel__title mt-1 text-[18px] font-semibold text-[var(--color-text-primary)]">
          {mode === 'decision' ? '你已淘汰' : '观战中'}
        </h3>
        <p className="eliminated-choice-panel__subtitle mt-1 text-[11px] leading-[1.5] text-[var(--color-text-dim)]">
          {mode === 'decision'
            ? '桌上仍有玩家持筹码，选择返回大厅或继续观战。'
            : (isBotsOnlyContinuation
              ? 'Bot 将自动继续下一手（约 1.5 秒）。'
              : '由仍有筹码的玩家决定何时开始下一手。')}
        </p>
      </div>

      {mode === 'decision' ? (
        <div className="eliminated-choice-panel__actions flex items-center gap-2.5">
          <button
            type="button"
            onClick={onSpectate}
            className="eliminated-choice-panel__spectate h-10 flex-1 rounded-xl border border-[var(--color-gold)]/45 bg-gradient-to-r from-[#c7a23d] via-[#dfbe66] to-[#edcf86] text-[13px] font-semibold text-[#241700] transition-all hover:brightness-105"
          >
            继续观战
          </button>
          <button
            type="button"
            onClick={onBackToLobby}
            className="eliminated-choice-panel__back h-10 flex-1 rounded-xl border border-white/14 bg-white/[0.05] text-[13px] font-semibold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-gold)]/32 hover:text-[var(--color-text-primary)]"
          >
            返回大厅
          </button>
        </div>
      ) : (
        <div className="eliminated-choice-panel__spectating-row flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <span className="eliminated-choice-panel__spectating-label text-[12px] text-[var(--color-text-secondary)]">
            {isBotsOnlyContinuation ? '观战中 · Bot 自动续局' : '观战中 · 存活玩家控制续局'}
          </span>
          <button
            type="button"
            onClick={onBackToLobby}
            className="eliminated-choice-panel__spectating-back rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-gold)]/36 hover:text-[var(--color-text-primary)]"
          >
            返回大厅
          </button>
        </div>
      )}
    </motion.section>
  );
});
