'use client';

import { memo, useMemo, useState } from 'react';
import type { CoachActionKind, CoachAdvice, CoachVerdict, GameReviewEvent, HandState } from '@aipoker/shared';
import { useT } from '@/i18n';
import { cn, formatChips } from '@/lib/utils';
import type { GameScreenState } from '../../lib/game-screen-state';
import type { HeroHandSummary } from '../../lib/hand-log-hero';
import { useHeroSummaryText } from './labels';
import {
  clearsPrice,
  coachEmptyState,
  coachVerdict,
  deriveCoachContext,
  formatPotOddsRatio,
  formatSpr,
  frequencyLabel,
  optionText,
  percent,
  reasonText,
  reviewRowText,
  sessionText,
  sizeText,
  strengthFill,
  type CoachData,
} from './coach-model';

export const OPTION_CLASS: Record<CoachActionKind, string> = {
  bet: 'text-vermilion-hi',
  raise: 'text-vermilion-hi',
  all_in: 'text-vermilion-hi',
  call: 'text-text',
  check: 'text-text',
  fold: 'text-text-2',
};

/** Existing state inks only: positive for matched, caution for close, plain text for off. */
const VERDICT_CLASS: Record<CoachVerdict, string> = {
  matched: 'text-positive',
  close: 'text-caution',
  off: 'text-text',
};

const NO_ROWS: ReadonlySet<number> = new Set();

const POSITION_KEYS = new Set(['utg', 'hj', 'co', 'btn', 'sb', 'bb']);

interface CoachViewProps {
  data: GameScreenState['trainingData'];
  hand: HandState | null;
  heroId: string | null;
  /** The finished hand's outcome for the hero, shown once the hand is over. */
  heroSummary?: HeroHandSummary | null | undefined;
  /** The graded decisions to show off-turn: this hand's once it is over, or the last hand's (see `reviewToShow`). */
  review?: { review: GameReviewEvent; which: 'this' | 'last' } | null | undefined;
  isVisible: boolean;
  onToggle: () => void;
  className?: string | undefined;
}

export const CoachView = memo(function CoachView({ data, hand, heroId, heroSummary, review, isVisible, onToggle, className }: CoachViewProps) {
  const t = useT();
  const heroText = useHeroSummaryText();
  const context = useMemo(() => deriveCoachContext(hand, heroId), [hand, heroId]);
  const nameOf = (id: string) => hand?.players.find((player) => player.id === id)?.name ?? id;
  // Open rows live here, not in HandReview, so they stay open when the next hand deals and the
  // review moves to another branch below; a new hand's review starts closed.
  const [openRows, setOpenRows] = useState<{ handNumber: number; rows: ReadonlySet<number> } | null>(null);
  const reviewList = review ? (
    <HandReview
      {...review}
      open={openRows?.handNumber === review.review.handNumber ? openRows.rows : NO_ROWS}
      onToggle={(index) =>
        setOpenRows((current) => {
          const rows = new Set(current?.handNumber === review.review.handNumber ? current.rows : NO_ROWS);
          if (!rows.delete(index)) rows.add(index);
          return { handNumber: review.review.handNumber, rows };
        })
      }
      nameOf={nameOf}
    />
  ) : null;

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
      <div className={cn('min-h-0 overflow-y-auto px-4 py-5 text-body', className)}>
        {state === 'hand_over' && heroSummary && <p className="mb-2 font-semibold text-text">{heroText(heroSummary)}</p>}
        <p className="text-text-3">{message}</p>
        {reviewList}
      </div>
    );
  }

  const advice = data.advice;
  // Preflop the advice has no pot odds unless the price check ran; they follow from the same hand state (call / (pot + call)).
  const potOdds =
    advice?.potOdds ?? (context && context.toCall > 0 ? context.toCall / (context.pot + context.toCall) : undefined);
  const positionKey = data.position?.toLowerCase();
  const positionNote = positionKey && POSITION_KEYS.has(positionKey) ? t(`panel.coach.pos.${positionKey as 'utg'}`) : null;

  return (
    <div className={cn('min-h-0 overflow-y-auto px-4 py-4', className)}>
      {strengthFill(data) !== null && <StrengthBlock data={data} opponents={context?.opponents ?? null} />}

      {data.heroTurn ? (
        <>
          {/* Two rows: the price (pot odds, to call), then the spot (position, SPR from the flop on). */}
          <dl className="mt-4 grid grid-cols-2 border-y border-line [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-line">
            <Stat
              label={t('panel.coach.stat.pot_odds')}
              value={potOdds !== undefined ? `${percent(potOdds)}%` : '—'}
              note={
                potOdds !== undefined && formatPotOddsRatio(potOdds)
                  ? t('panel.coach.sub.pot_odds', { ratio: formatPotOddsRatio(potOdds) ?? '' })
                  : null
              }
            />
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
            <Stat label={t('panel.coach.stat.position')} value={data.position ?? '—'} note={positionNote} />
            <Stat label={t('panel.coach.stat.spr')} value={advice?.spr !== undefined ? formatSpr(advice.spr) : '—'} note={null} divided />
          </dl>

          {advice ? (
            <Suggestion advice={advice} nameOf={nameOf} />
          ) : (
            <p className="mt-4 text-body text-text-3">{t('panel.coach.loading')}</p>
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
          {reviewList}
        </div>
      )}
    </div>
  );
});

/**
 * What the TAG policy does here: one action when it mostly takes it, otherwise the mix, and
 * "close" when the equity estimate's noise could change it. Then the reasons, as recorded by the policy.
 */
function Suggestion({ advice, nameOf }: { advice: CoachAdvice; nameOf: (id: string) => string }) {
  const t = useT();
  const verdict = coachVerdict(advice);
  const top = advice.options[0];
  if (!top) return null;

  return (
    <section aria-label={t('panel.tab.coach')} className="mt-4">
      <p className="label-index text-micro text-text-3">{t('panel.coach.source')}</p>
      <p
        className={cn(
          'mt-1 font-index text-title font-semibold uppercase tracking-caps-tight',
          verdict === 'commit' ? OPTION_CLASS[top.kind] : 'text-text',
        )}
      >
        {verdict === 'commit' ? optionText(top, t) : t(`panel.coach.verdict.${verdict}`)}
      </p>
      {verdict === 'commit' && advice.options.length === 1 && sizeText(top, t) && (
        <p className="mt-1 text-body text-text-3">{sizeText(top, t)}</p>
      )}

      {advice.options.length > 1 && (
        <ul className="mt-2 space-y-2">
          {advice.options.map((option) => (
            <li key={`${option.kind}:${option.to ?? ''}`} className="text-body">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn('font-semibold', OPTION_CLASS[option.kind])}>
                  {optionText(option, t)}
                  {sizeText(option, t) && <span className="ml-2 font-normal text-text-3">{sizeText(option, t)}</span>}
                </span>
                <span className="font-index font-semibold text-text-2">{frequencyLabel(option.frequency)}</span>
              </div>
              {option.reasons.map((reason) => (
                <p key={JSON.stringify(reason)} className="mt-0.5 text-text-3">
                  {reasonText(reason, t, nameOf)}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
      {verdict === 'close' && <p className="mt-2 text-body text-caution">{t('panel.coach.close_note')}</p>}

      {advice.reasons.length > 0 && (
        <ul className="mt-3 max-w-[38ch] space-y-1 border-t border-line pt-3">
          {advice.reasons.map((reason) => (
            <li key={JSON.stringify(reason)} className="text-body text-text-2">
              {reasonText(reason, t, nameOf)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The hero's decisions next to the TAG policy's options, each with its verdict; a row opens to the
 * policy's reasons. Then the session tally, which counts verdicts and is not a score.
 */
function HandReview({
  review,
  which,
  open,
  onToggle,
  nameOf,
}: {
  review: GameReviewEvent;
  which: 'this' | 'last';
  open: ReadonlySet<number>;
  onToggle: (index: number) => void;
  nameOf: (id: string) => string;
}) {
  const t = useT();
  const title = t(which === 'this' ? 'panel.review.this_hand' : 'panel.review.last_hand');

  return (
    <section aria-label={title} className="mt-4 border-t border-line pt-3">
      <p className="label-index text-micro text-text-3">{title}</p>
      <ul className="mt-1 divide-y divide-line">
        {review.decisions.map((decision, index) => {
          const row = reviewRowText(decision, t, nameOf);
          const expanded = open.has(index);
          return (
            <li key={decision.advice.actionIndex}>
              <button
                type="button"
                aria-expanded={expanded}
                disabled={row.reasons.length === 0}
                onClick={() => onToggle(index)}
                className="block w-full py-snug text-left transition-colors duration-150 ease-out enabled:hover:bg-panel-2/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brass)]"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="label-index text-micro text-text-3">{row.street}</span>
                  <span className={cn('label-index flex items-center gap-tight text-micro', VERDICT_CLASS[decision.verdict])}>
                    {row.verdict}
                    {row.reasons.length > 0 && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                        className={cn('shrink-0 text-text-3 transition-transform duration-150 ease-out', expanded && 'rotate-180')}
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    )}
                  </span>
                </span>
                <span className="mt-1 block font-index text-lead font-semibold text-text">{row.hero}</span>
                <span className="mt-1 block font-index text-body text-text-2">{row.policy}</span>
              </button>
              {expanded && (
                <div className="space-y-snug pb-3 text-body">
                  {row.reasons.map((group) => (
                    <div key={group.label ?? ''}>
                      {group.label && <p className="font-index font-semibold text-text-2">{group.label}</p>}
                      {group.lines.map((line) => (
                        <p key={line} className="text-text-3">
                          {line}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 border-t border-line pt-3 font-index text-body text-text-2">{sessionText(review.session, t)}</p>
    </section>
  );
}

/** Hand strength; with a price to pay, one bar compares equity against the equity the price requires. */
function StrengthBlock({ data, opponents }: { data: CoachData; opponents: number | null }) {
  const t = useT();
  const advice = data.advice;
  const equity = advice?.equity;
  const quiet = !advice;
  const need = equity !== undefined ? advice?.requiredEquity : undefined;
  const clears = clearsPrice(advice);
  const fill = strengthFill(data) ?? 0;

  const versusRange = advice?.equityVs === 'range';
  // Preflop the equity is against only the players who put chips in, not everyone still to act.
  const against = advice?.equityAgainst ?? opponents;
  const label = equity !== undefined
    ? against && against > 1
      ? t(versusRange ? 'panel.coach.equity.range.many' : 'panel.coach.equity.many', { count: against })
      : t(versusRange ? 'panel.coach.equity.range.one' : 'panel.coach.equity.one')
    : t('panel.coach.strength');
  const value = equity !== undefined
    ? `${percent(equity)}%`
    : t('panel.coach.strength.top', { percent: percent(1 - (data.handPercentile ?? 1)) });

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
