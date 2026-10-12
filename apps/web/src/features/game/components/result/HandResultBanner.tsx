'use client';

import { useMemo } from 'react';
import { useT } from '@/i18n';
import { cn, formatChips } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { selectHandResult, useGameStore, type HandResult } from '@/stores/gameStore';
import { summarizeHeroHand } from '../../lib/hand-log-hero';
import { summarizeResult } from '../../lib/hand-log-model';
import { capitalize, useHeroSummaryText, useRankText } from '../side-panel/labels';
import { MiniCards } from '../side-panel/MiniCards';

export interface HandResultBannerProps {
  /** Defaults to the store's hand result, so `<HandResultBanner />` is a complete mount. */
  result?: HandResult | null | undefined;
  className?: string | undefined;
}

/**
 * Non-blocking hand result stamp: winner, amount, hand name, the best five
 * cards, and one line about the hero's own hand. Visible only while
 * `result.phase === 'showing'` (the window the old modal used), so it leaves on
 * the existing phase timers, and it never takes pointer events.
 *
 * Placement: in the action dock (the shell mounts it there). It is in-flow,
 * fills its container up to 30rem, and is 72px tall, so the dock must give it
 * a 72px row at 360px width. The amount in the title is the gross pot won (the
 * same number the seat shows); the hero line is explicitly labelled net.
 */
export function HandResultBanner({ result: resultProp, className }: HandResultBannerProps) {
  const t = useT();
  const rankText = useRankText();
  const heroText = useHeroSummaryText();
  const storeResult = useGameStore(selectHandResult);
  const hand = useGameStore((state) => state.hand);
  const heroId = useAuthStore((state) => state.user?.id ?? null);
  const result = resultProp === undefined ? storeResult : resultProp;

  const lines = useMemo(() => (result ? summarizeResult(result) : []), [result]);
  const hero = useMemo(
    () => (hand && result && hand.phase === 'hand_end' ? summarizeHeroHand(hand, result, heroId) : null),
    [hand, result, heroId],
  );

  if (!result || result.phase !== 'showing') return null;
  const [top] = lines;
  if (!top) return null;

  const rank = rankText(top.handRankName);
  const more = lines.length - 1;
  const champion = result.table.isTableFinished ? result.table.championPlayerName : null;
  // The hero line already names the hand when the hero won with it.
  const heroNamesRank = hero?.outcome === 'won' && Boolean(hero.handRank) && hero.handRank === top.handRankName && !champion;
  const second = [rank && !heroNamesRank ? capitalize(rank) : null, more > 1 ? t('panel.banner.more', { count: more }) : more === 1 ? t('panel.banner.more_one') : null]
    .filter(Boolean)
    .join(' · ');
  const third = champion ? t('panel.banner.champion', { name: champion }) : hero ? heroText(hero) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('panel.banner.label')}
      className={cn('pointer-events-none flex w-full justify-center', className)}
    >
      <div
        data-layout-box="result-banner"
        className="grid h-18 w-full max-w-[30rem] min-w-0 animate-[table-fade-in_180ms_var(--ease-out)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-group overflow-hidden rounded-[var(--radius-panel)] border border-brass/70 bg-ink-1 px-gutter shadow-[inset_0_0_0_3px_var(--color-ink-1),inset_0_0_0_4px_rgb(184_154_94/0.4),var(--shadow-plate)] motion-reduce:animate-none"
      >
        {top.cards.length > 0 ? (
          <div className="flex shrink-0">
            <MiniCards cards={top.cards} size="sm" className="flex-nowrap sm:hidden" />
            <MiniCards cards={top.cards} size="md" className="flex-nowrap max-sm:hidden" />
          </div>
        ) : (
          <span aria-hidden />
        )}
        <div className="min-w-0 text-body">
          <p className="flex items-baseline gap-x-snug whitespace-nowrap">
            <span className="min-w-0 truncate font-semibold text-text">{top.playerName}</span>
            <span className="shrink-0 text-text-2">{t('panel.banner.wins')}</span>
          </p>
          {second && <p className="truncate text-text-2">{second}</p>}
          {third && <p className={cn('truncate font-semibold', champion ? 'text-brass' : 'text-text')}>{third}</p>}
        </div>
        <span className="font-index text-value font-semibold tabular-nums text-brass">{formatChips(top.amount)}</span>
      </div>
    </div>
  );
}
