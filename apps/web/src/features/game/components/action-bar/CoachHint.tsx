'use client';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { coachVerdict, formatSpr, frequencyLabel, optionText, percent, sizeText, type CoachData } from '../side-panel/coach-model';
import { OPTION_CLASS } from '../side-panel/CoachView';

/**
 * One line of the coach above the action buttons, for screens where the Coach tab is not on screen
 * (below xl the panel is a closed sheet; at xl the panel column may be collapsed): the policy's
 * most likely action, how mixed it is, and the hand's strength.
 */
export function CoachHint({ data, isPanelCollapsed }: { data: CoachData | undefined; isPanelCollapsed: boolean }) {
  const t = useT();
  const advice = data?.advice;
  const top = advice?.options[0];
  if (!advice || !top) return null;

  const verdict = coachVerdict(advice);
  const size = sizeText(top, t);
  const strength =
    advice.equity !== undefined
      ? t(advice.equityVs === 'range' ? 'panel.coach.hint.equity_range' : 'panel.coach.hint.equity', { percent: percent(advice.equity) })
      : data?.handPercentile !== undefined
        ? t('panel.coach.strength.top', { percent: percent(1 - data.handPercentile) })
        : null;

  return (
    <p
      data-layout-box="coach-hint"
      className={cn('flex items-baseline gap-snug truncate text-body text-text-2', !isPanelCollapsed && 'xl:hidden')}
    >
      <span className="label-index text-micro text-text-3">{t('panel.tab.coach')}</span>
      <span className={cn('shrink-0 font-semibold', OPTION_CLASS[top.kind])}>{optionText(top, t)}</span>
      {size && <span className="shrink-0 text-text-3">{size}</span>}
      {verdict !== 'commit' && (
        <span className="shrink-0 text-text-3">
          {frequencyLabel(top.frequency)} · {t(`panel.coach.verdict.${verdict}`)}
        </span>
      )}
      {strength && (
        <>
          <span aria-hidden>·</span>
          <span className="truncate">
            {strength}
            {advice.spr !== undefined && ` · ${t('panel.coach.hint.spr', { spr: formatSpr(advice.spr) })}`}
          </span>
        </>
      )}
    </p>
  );
}
