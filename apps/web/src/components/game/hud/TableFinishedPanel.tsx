'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn, formatChips } from '@/lib/utils';

interface TableFinishedPanelProps {
  championName?: string | null;
  championStack?: number | null;
  handNumber?: number | null;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
  className?: string;
}

export const TableFinishedPanel = memo(function TableFinishedPanel({
  championName,
  championStack,
  handNumber,
  onPlayAgain,
  onBackToLobby,
  className,
}: TableFinishedPanelProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={cn(
        'table-finished-panel w-full rounded-2xl border border-[var(--color-gold)]/35',
        'bg-[linear-gradient(145deg,rgba(10,18,30,0.94),rgba(13,22,34,0.9)_52%,rgba(8,14,24,0.94))]',
        'px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.46),0_0_38px_rgba(255,215,0,0.15)]',
        className,
      )}
    >
      {/* Single-row layout: info | champion | actions */}
      <div className="flex items-center gap-4">
        {/* Crown + title */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-gold)]/35 bg-[var(--color-gold)]/12 text-[18px] text-[var(--color-gold)]">
            &#9819;
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-gold-muted)]">
              Table Complete
            </p>
            <h3 className="mt-0.5 text-[15px] font-semibold leading-tight text-[var(--color-text-primary)]">
              本场结束
            </h3>
          </div>
        </div>

        {/* Divider */}
        <div className="h-8 w-px shrink-0 bg-white/10" />

        {/* Champion info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-[var(--color-text-muted)]">冠军</p>
            {typeof handNumber === 'number' && handNumber > 0 && (
              <span className="rounded-md border border-white/8 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)]">
                {handNumber} 手
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
              {championName ?? '玩家'}
            </p>
            {typeof championStack === 'number' && (
              <p className="shrink-0 font-chips text-[13px] text-[var(--color-gold)]">
                {formatChips(championStack)}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onPlayAgain}
            className="h-9 rounded-xl border border-[var(--color-gold)]/42 bg-gradient-to-r from-[#c9a440] via-[#dfbe68] to-[#edcf88] px-4 text-[13px] font-semibold text-[#231700] transition-all hover:brightness-105"
          >
            再来一局
          </button>
          <button
            type="button"
            onClick={onBackToLobby}
            className="h-9 rounded-xl border border-white/14 bg-white/[0.05] px-4 text-[13px] font-semibold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-gold)]/32 hover:text-[var(--color-text-primary)]"
          >
            返回大厅
          </button>
        </div>
      </div>
    </motion.section>
  );
});
