'use client';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { formatSpr, percent, sizeText, suggestionText, type CoachData } from '../side-panel/coach-model';
import { SUGGESTION_CLASS } from '../side-panel/CoachView';

/**
 * One line of the coach above the action buttons, for screens where the side panel is a closed
 * sheet (below xl): the suggested action and the hand's strength, at the decision point.
 */
export function CoachHint({ data }: { data: CoachData | undefined }) {
  const t = useT();
  if (!data?.suggestion) return null;

  const strength =
    data.strength.kind === 'equity'
      ? t(data.equityVs === 'range' ? 'panel.coach.hint.equity_range' : 'panel.coach.hint.equity', {
          percent: percent(data.strength.value),
        })
      : t('panel.coach.strength.top', { percent: percent(1 - data.strength.value) });
  const size = sizeText(data, t);

  return (
    <p data-layout-box="coach-hint" className="flex items-baseline gap-snug truncate text-body text-text-2 xl:hidden">
      <span className="label-index text-micro text-text-3">{t('panel.tab.coach')}</span>
      <span className={cn('shrink-0 font-semibold', SUGGESTION_CLASS[data.suggestion])}>{suggestionText(data, t)}</span>
      {size && <span className="shrink-0 text-text-3">{size}</span>}
      <span aria-hidden>·</span>
      <span className="truncate">
        {strength}
        {data.spr !== undefined && ` · ${t('panel.coach.hint.spr', { spr: formatSpr(data.spr) })}`}
      </span>
    </p>
  );
}
