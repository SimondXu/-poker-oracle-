'use client';

import { memo, useMemo } from 'react';
import type { HandState } from '@aipoker/shared';
import { useT } from '@/i18n';
import { cn, formatChips } from '@/lib/utils';
import type { GameScreenState } from '../../lib/game-screen-state';
import type { HeroHandSummary } from '../../lib/hand-log-hero';
import { useHeroSummaryText } from './labels';
import {
  clearsPrice,
  coachEmptyState,
  coachReason,
  deriveCoachContext,
  formatPotOddsRatio,
  percent,
  strengthFill,
  type CoachData,
} from './coach-model';

export const SUGGESTION_CLASS: Record<NonNullable<CoachData['suggestion']>, string> = {
  raise: 'text-vermilion-hi',
  call: 'text-text',
  check: 'text-text',
  fold: 'text-text-2',
};

const POSITION_KEYS = new Set(['utg', 'hj', 'co', 'btn', 'sb', 'bb']);

interface CoachViewProps {
  data: GameScreenState['trainingData'];
  hand: HandState | null;
  heroId: string | null;
  /** The finished hand's outcome for the hero, shown once the hand is over. */
  heroSummary?: HeroHandSummary | null | undefined;
  isVisible: boolean;
  onToggle: () => void;
  className?: string | undefined;
}

export const CoachView = memo(function CoachView({ data, hand, heroId, heroSummary, isVisible, onToggle, className }: CoachViewProps) {
  const t = useT();
  const heroText = useHeroSummaryText();
  const context = useMemo(() => deriveCoachContext(hand, heroId), [hand, heroId]);

  if (!isVisible) {
    return (
      <div className={cn('flex flex-col items-start gap-group px-4 py-5 text-body text-text-2', className)}>
        <p>{t('panel.coach.off')}</p>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-[var(--radius-control)] border border-brass/60 px-3 py-snug text-body font-semibold text-brass transition-[transform,background-color] duration-150 ease-out hover:bg-panel-2 active:scale-[0.97]"
        >
          {t('panel.coach.enable')}
        </button>
      </div>
    );
  }

  if (!data) {
    const state = coachEmptyState(hand, heroId);
    const message = {
      no_cards: t('panel.coach.empty'),
      hand_over: t('panel.coach.hand_over'),
      folded: t('panel.coach.folded'),
      waiting: t('panel.coach.returns'),
    }[state];
    return (
      <div className={cn('px-4 py-5 text-body', className)}>
        {state === 'hand_over' && heroSummary && <p className="mb-2 font-semibold text-text">{heroText(heroSummary)}</p>}
        <p className="text-text-3">{message}</p>
      </div>
    );
  }

  const isHeroTurn = data.suggestion !== undefined;
  // The engine reports pot odds postflop only; preflop they follow from the same hand state (call / (pot + call)).
  const potOdds =
    data.potOdds ?? (context && context.toCall > 0 ? context.toCall / (context.pot + context.toCall) : undefined);
  const reason = coachReason(data, t);
  const positionKey = data.position?.toLowerCase();
  const positionNote = positionKey && POSITION_KEYS.has(positionKey) ? t(`panel.coach.pos.${positionKey as 'utg'}`) : null;

  return (
    <div className={cn('min-h-0 overflow-y-auto px-4 py-4', className)}>
      <StrengthBlock data={data} opponents={context?.opponents ?? null} quiet={!isHeroTurn} />

      {isHeroTurn ? (
        <>
          <dl className="mt-4 grid grid-cols-3 border-y border-line">
            <Stat
              label={t('panel.coach.stat.pot_odds')}
              value={potOdds !== undefined ? `${percent(potOdds)}%` : '—'}
              note={
                potOdds !== undefined && formatPotOddsRatio(potOdds)
                  ? t('panel.coach.sub.pot_odds', { ratio: formatPotOddsRatio(potOdds) ?? '' })
                  : null
              }
            />
            <Stat label={t('panel.coach.stat.position')} value={data.position ?? '—'} note={positionNote} divided />
            <Stat
              label={t('panel.coach.stat.to_call')}
              value={context ? formatChips(context.toCall) : '—'}
              note={
                context
                  ? context.toCall > 0
                    ? t('panel.coach.sub.to_call', { pot: formatChips(context.pot) })
                    : t('panel.coach.sub.free')
                  : null
              }
              divided
            />
          </dl>

          {data.suggestion && (
            <section aria-label={t('panel.tab.coach')} className="mt-4">
              <p className={cn('font-index text-title font-semibold uppercase tracking-caps-tight', SUGGESTION_CLASS[data.suggestion])}>
                {t(`panel.coach.suggest.${data.suggestion}`)}
              </p>
              {reason && <p className="mt-2 max-w-[34ch] text-body text-text-2">{reason}</p>}
            </section>
          )}
        </>
      ) : (
        <div className="mt-4 space-y-snug border-t border-line pt-3 text-body">
          <p className="flex items-baseline justify-between">
            <span className="text-text-3">{t('panel.coach.stat.position')}</span>
            <span className="font-index text-lead font-semibold text-text-2">
              {data.position ?? '—'}
              {positionNote ? <span className="ml-2 font-sans text-body font-normal text-text-3">{positionNote}</span> : null}
            </span>
          </p>
          <p className="pt-2 text-body text-text-3">{t('panel.coach.waiting')}</p>
        </div>
      )}
    </div>
  );
});

/** Hand strength; with a price to pay, one bar compares equity against the equity the price requires. */
function StrengthBlock({ data, opponents, quiet }: { data: CoachData; opponents: number | null; quiet: boolean }) {
  const t = useT();
  const { strength } = data;
  const isEquity = strength.kind === 'equity';
  const need = isEquity && !quiet ? data.winRequirement : undefined;
  const clears = clearsPrice(data);
  const fill = strengthFill(data);

  const label = isEquity
    ? opponents === 1
      ? t('panel.coach.equity.one')
      : opponents && opponents > 1
        ? t('panel.coach.equity.many', { count: opponents })
        : t('panel.coach.equity.one')
    : t('panel.coach.strength');
  const value = isEquity ? `${percent(strength.value)}%` : t('panel.coach.strength.top', { percent: percent(1 - strength.value) });

  const fillClass = need === undefined ? (quiet ? 'bg-ink-7' : 'bg-brass') : clears ? 'bg-positive' : 'bg-caution';
  const needLeft = need === undefined ? 0 : Math.min(0.92, Math.max(0.08, need));

  return (
    <section aria-label={label}>
      <p className="text-body text-text-2">{label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span
          className={cn(
            'font-index font-semibold',
            quiet ? 'text-title text-text-2' : 'text-display text-text',
          )}
        >
          {value}
        </span>
        {need !== undefined && clears !== null && (
          <span className={cn('text-right text-body font-semibold', clears ? 'text-positive' : 'text-caution')}>
            {clears ? t('panel.coach.verdict.clears') : t('panel.coach.verdict.short')}
          </span>
        )}
      </div>

      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill * 100)}
        aria-valuetext={need !== undefined ? `${value}, ${t('panel.coach.need', { percent: percent(need) })}` : value}
        className={cn('relative mt-3 rounded-[1px] bg-ink-3', quiet ? 'h-[4px]' : 'h-[10px]')}
      >
        <div className={cn('h-full rounded-[1px]', fillClass)} style={{ width: `${fill * 100}%` }} />
        {need !== undefined && (
          <span
            aria-hidden
            className="absolute -top-[4px] h-[18px] w-[2px] -translate-x-1/2 bg-text"
            style={{ left: `${Math.min(1, need) * 100}%` }}
          />
        )}
      </div>
      {need !== undefined && (
        <div className="relative mt-1.5 h-4" aria-hidden>
          <span
            className="font-index absolute top-0 -translate-x-1/2 whitespace-nowrap text-body font-semibold text-text-2"
            style={{ left: `${needLeft * 100}%` }}
          >
            {t('panel.coach.need', { percent: percent(need) })}
          </span>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, note, divided }: { label: string; value: string; note: string | null; divided?: boolean }) {
  return (
    <div className={cn('min-w-0 py-3', divided ? 'border-l border-line pl-3' : 'pr-3')}>
      <dt className="label-index truncate text-micro text-text-3">{label}</dt>
      <dd className="mt-1">
        <span className="font-index block text-value font-semibold text-text">{value}</span>
        {note ? <span className="mt-1 block truncate text-body text-text-3">{note}</span> : null}
      </dd>
    </div>
  );
}
