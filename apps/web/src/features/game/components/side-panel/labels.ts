'use client';

import { useCallback } from 'react';
import { useT } from '@/i18n';
import { formatChips } from '@/lib/utils';
import type { HeroHandSummary } from '../../lib/hand-log-hero';
import { handRankKey } from '../../lib/hand-log-model';

/** "two pair" → "Two pair" (a no-op for Chinese). */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Translates the server's hand name; an unknown name is shown as received. */
export function useRankText(): (name: string | null | undefined) => string | null {
  const t = useT();
  return useCallback(
    (name) => {
      if (!name) return null;
      const key = handRankKey(name);
      return key ? t(`panel.rank.${key}`) : name;
    },
    [t],
  );
}

/** "You lost 120 · folded turn" / "You won 260 with two pair". */
export function useHeroSummaryText(): (summary: HeroHandSummary) => string {
  const t = useT();
  const rankText = useRankText();
  return useCallback(
    (summary) => {
      const amount = formatChips(Math.abs(summary.net));
      const street = summary.foldedStreet ? t(`panel.summary.street.${summary.foldedStreet}`) : '';
      if (summary.outcome === 'won') {
        const hand = rankText(summary.handRank);
        // Name the gross win too, so it matches the "+X" on the seat.
        const won = formatChips(summary.payout);
        if (hand) return t('panel.summary.won_with', { amount, won, hand });
        return t(summary.uncontested ? 'panel.summary.won_uncontested' : 'panel.summary.won', { amount, won });
      }
      if (summary.outcome === 'lost') {
        if (street) return t('panel.summary.lost_folded', { amount, street });
        return t('panel.summary.lost_showdown', { amount });
      }
      return street ? t('panel.summary.even_folded', { street }) : t('panel.summary.even');
    },
    [t, rankText],
  );
}
