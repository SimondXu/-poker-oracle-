'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn, formatChips } from '@/lib/utils';
import type { HandResult } from '@/stores/gameStore';

interface WinnerAnnouncementProps {
  result: HandResult;
  onDismiss?: (() => void) | undefined;
  onPlayAgain?: (() => void) | undefined;
  onBackToLobby?: (() => void) | undefined;
  className?: string | undefined;
}

export const WinnerAnnouncement = memo(function WinnerAnnouncement({
  result,
  onDismiss,
  onPlayAgain,
  onBackToLobby,
  className,
}: WinnerAnnouncementProps) {
  const sortedPayouts = useMemo(
    () => [...result.payouts].sort((a, b) => b.amount - a.amount),
    [result.payouts],
  );

  const canDismiss = result.phase === 'showing';
  const isTableFinished = result.table.isTableFinished;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn('fixed inset-0 z-50 flex items-center justify-center px-4', className)}
    >
      <button
        type="button"
        aria-label="关闭赢家公告"
        onClick={canDismiss ? onDismiss : undefined}
        className={cn(
          'absolute inset-0 cursor-default bg-[radial-gradient(circle_at_center,rgba(255,215,0,0.16),rgba(3,7,14,0.78)_48%,rgba(2,4,9,0.92)_100%)]',
          canDismiss && 'cursor-pointer',
        )}
      />

      <motion.section
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className={cn(
          'relative w-full max-w-[640px] overflow-hidden rounded-[22px] border border-[var(--color-gold)]/46',
          'bg-[linear-gradient(155deg,rgba(11,19,31,0.95),rgba(8,15,26,0.95)_48%,rgba(13,21,33,0.94))]',
          'shadow-[0_30px_70px_rgba(0,0,0,0.55),0_0_50px_rgba(255,215,0,0.22)] backdrop-blur-xl',
        )}
      >
        <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-gold)]/75 to-transparent" />
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--color-gold-muted)]">Hand Result</p>
              <h2 className="mt-1 font-display text-[32px] leading-none text-[var(--color-text-primary)] sm:text-[36px]">
                本手结算
              </h2>
            </div>
            <div className="rounded-xl border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">总底池</p>
              <p className="font-chips text-[18px] font-bold text-[var(--color-gold)]">
                {formatChips(result.potTotal)}
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {sortedPayouts.map((payout, index) => {
              const descriptor = payout.handRankName || '对手弃牌获胜';
              return (
                <motion.article
                  key={`${payout.playerId}-${index}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08, duration: 0.24 }}
                  className="rounded-xl border border-white/10 bg-[rgba(10,17,28,0.88)] px-3.5 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-[var(--color-text-primary)]">
                        {payout.playerName}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">{descriptor}</p>
                    </div>
                    <motion.p
                      animate={{ scale: [1, 1.06, 1] }}
                      transition={{ duration: 0.45, delay: 0.2 + index * 0.06 }}
                      className="font-chips text-[19px] font-bold text-[var(--color-gold)]"
                    >
                      +{formatChips(payout.amount)}
                    </motion.p>
                  </div>
                </motion.article>
              );
            })}
          </div>

          {isTableFinished && canDismiss ? (
            <div className="mt-5 space-y-2.5">
              <div className="mb-3 rounded-xl border border-[var(--color-gold)]/20 bg-[var(--color-gold)]/[0.06] px-3.5 py-2.5 text-center">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-gold-muted)]">Table Complete</p>
                <p className="mt-0.5 text-[14px] font-semibold text-[var(--color-text-primary)]">
                  {result.table.championPlayerName
                    ? `${result.table.championPlayerName} 获得冠军!`
                    : '本场已结束'}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onPlayAgain}
                  className="h-11 flex-1 rounded-xl border border-[var(--color-gold)]/45 bg-gradient-to-r from-[#c9a440] via-[#dfbe68] to-[#edcf88] text-[14px] font-semibold text-[#231700] transition-all hover:brightness-105 hover:shadow-[0_8px_20px_rgba(214,178,84,0.3)]"
                >
                  再来一局
                </button>
                <button
                  type="button"
                  onClick={onBackToLobby}
                  className="h-11 flex-1 rounded-xl border border-white/14 bg-white/[0.06] text-[14px] font-semibold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-gold)]/32 hover:bg-white/[0.1] hover:text-[var(--color-text-primary)]"
                >
                  返回大厅
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-center text-[11px] text-[var(--color-text-dim)]">
              {canDismiss
                ? '点击任意区域可关闭，或等待自动进入下一手'
                : '正在展示结算结果...'}
            </p>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
});
