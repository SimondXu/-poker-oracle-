'use client';

import { selectHandResult, useGameStore, type HandResult } from '@/stores/gameStore';
import { cn, formatChips } from '@/lib/utils';
import { summarizeResult } from '../../lib/hand-log-model';
import { MiniCards } from '../side-panel/MiniCards';

const MAX_LINES = 3;

export interface HandResultBannerProps {
  /** Defaults to the store's hand result, so `<HandResultBanner />` is a complete mount. */
  result?: HandResult | null | undefined;
  className?: string | undefined;
}

/**
 * Non-blocking hand result banner (replaces the WinnerAnnouncement modal).
 * Visible only while `result.phase === 'showing'`, which is the same window the
 * modal used, so it auto-dismisses on the existing phase timers. Never captures
 * pointer events. Mount inside the relative table `section` in GameView.
 */
export function HandResultBanner({ result: resultProp, className }: HandResultBannerProps) {
  const storeResult = useGameStore(selectHandResult);
  const result = resultProp === undefined ? storeResult : resultProp;
  if (!result || result.phase !== 'showing') return null;

  const lines = summarizeResult(result);
  if (lines.length === 0) return null;

  const shown = lines.slice(0, MAX_LINES);
  const hidden = lines.length - shown.length;
  const champion = result.table.isTableFinished ? result.table.championPlayerName : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute inset-x-0 top-14 z-30 md:top-2 flex justify-center px-3',
        className,
      )}
    >
      <div className="max-w-full animate-[table-fade-in_180ms_ease-out] rounded-[var(--radius-panel)] border border-line bg-panel px-3 py-1.5 text-center text-[13px] leading-5 shadow-plate">
        {shown.map((line) => (
          <p key={line.playerId} className="flex flex-wrap items-center justify-center gap-x-1.5">
            <span className="font-bold text-text">{line.playerName}</span>
            <span className="text-text-2">赢得</span>
            <span className="font-bold tabular-nums text-chip">{formatChips(line.amount)}</span>
            {line.handRankName ? <span className="text-text-2">· {line.handRankName}</span> : null}
            {line.cards.length > 0 ? <MiniCards cards={line.cards} className="ml-1 max-sm:hidden" /> : null}
          </p>
        ))}
        {hidden > 0 && <p className="text-[12px] text-text-3">另有 {hidden} 位赢家</p>}
        {champion ? <p className="mt-0.5 font-bold text-chip">{champion} 获得冠军</p> : null}
      </div>
    </div>
  );
}
