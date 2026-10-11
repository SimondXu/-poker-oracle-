'use client';

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { HandState } from '@aipoker/shared';
import { useT, type TFunction } from '@/i18n';
import { cn, formatChips } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import type { HandResult } from '@/stores/gameStore';
import { shouldShowWinnerIdentity } from '../../lib/table-animation';
import { summarizeHeroHand, type HeroHandSummary } from '../../lib/hand-log-hero';
import { selectPastHands, type HandLogSummary } from '../../lib/hand-log-history';
import {
  buildHandLog,
  type HandLog,
  type HandLogActionEntry,
  type HandLogBlindEntry,
  type HandLogEntry,
  type HandLogResultLine,
  type HandLogTone,
} from '../../lib/hand-log-model';
import { capitalize, useHeroSummaryText, useRankText } from './labels';
import { MiniCards } from './MiniCards';
import { useHandHistory } from './session-history';

/** Verb colors: raises and all-ins carry the one loud ink, calls take brass, the rest recede. */
const TONE_CLASS: Record<HandLogTone, string> = {
  fold: 'text-text-3',
  check: 'text-text-2',
  call: 'text-brass',
  raise: 'text-vermilion-hi',
  allin: 'font-semibold text-vermilion-hi',
};

const BAR_CLASS: Record<HandLogTone, string> = {
  fold: 'bg-ink-6',
  check: 'bg-ink-6',
  call: 'bg-brass/45',
  raise: 'bg-vermilion',
  allin: 'bg-vermilion',
};

/** A bet bar is full at this multiple of the pot; the tick marks one pot. */
const BAR_FULL_RATIO = 1.5;
const STICK_THRESHOLD_PX = 48;

interface HandLogViewProps {
  hand: HandState | null;
  handResult: HandResult | null | undefined;
  className?: string | undefined;
}

export const HandLogView = memo(function HandLogView({ hand, handResult, className }: HandLogViewProps) {
  const t = useT();
  const heroId = useAuthStore((state) => state.user?.id ?? null);
  const history = useHandHistory();

  // Only reveal winners once the table animation has: no spoilers before showdown.
  const visibleResult =
    hand?.phase === 'hand_end' && handResult && shouldShowWinnerIdentity(handResult.phase) ? handResult : null;
  const log = useMemo(() => (hand ? buildHandLog(hand, visibleResult) : null), [hand, visibleResult]);
  const heroSummary = useMemo(
    () => (hand && visibleResult ? summarizeHeroHand(hand, visibleResult, heroId) : null),
    [hand, visibleResult, heroId],
  );
  const pastHands = selectPastHands(history, hand?.roomId ?? null, hand?.handNumber ?? null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [isStuck, setIsStuck] = useState(true);
  const lineCount = log ? log.entries.length + log.results.length : 0;

  // Follow the newest line unless the user scrolled up to read; a new hand always snaps back to the bottom.
  const handNumber = hand?.handNumber;
  const lastHandNumber = useRef(handNumber);
  useLayoutEffect(() => {
    if (lastHandNumber.current !== handNumber) {
      lastHandNumber.current = handNumber;
      stickRef.current = true;
    }
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [lineCount, pastHands.length, handNumber]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setIsStuck(true);
    el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, []);

  if (!hand || !log) {
    return <p className={cn('px-4 py-5 text-body text-text-3', className)}>{t('panel.log.empty')}</p>;
  }

  return (
    <div className={cn('relative flex min-h-0 flex-col', className)}>
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          const stuck = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
          stickRef.current = stuck;
          setIsStuck((current) => (current === stuck ? current : stuck));
        }}
        role="log"
        aria-label={t('panel.log.label')}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4"
      >
        {pastHands.length > 0 && (
          <ul className="mb-3 border-b border-line pb-2">
            {pastHands.map((past) => (
              <PastHandRow key={`${past.roomId}-${past.handNumber}`} past={past} heroId={heroId} />
            ))}
          </ul>
        )}

        <HandBlock log={log} heroId={heroId} />

        {log.results.length > 0 && (
          <ResultBlock results={log.results} heroSummary={heroSummary} />
        )}
      </div>

      {!isStuck && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="label-index absolute bottom-3 left-1/2 -translate-x-1/2 rounded-[var(--radius-stamp)] border border-brass/60 bg-panel px-3 py-1 text-micro text-brass shadow-float transition-[transform,background-color] duration-150 ease-out hover:bg-panel-2 active:scale-[0.97]"
        >
          {t('panel.log.latest')}
        </button>
      )}
    </div>
  );
});

function HandBlock({ log, heroId }: { log: HandLog; heroId: string | null }) {
  const t = useT();
  const { header } = log;
  return (
    <section aria-label={t('panel.log.hand', { number: header.handNumber })}>
      <h3 className="flex flex-wrap items-baseline gap-x-3 border-b border-line-2 pb-snug">
        <span className="font-index text-label font-semibold tracking-wide text-text">
          {t('panel.log.hand', { number: header.handNumber })}
        </span>
        <span className="font-index text-body tracking-wide text-text-3">
          {t('panel.log.blinds', { sb: formatChips(header.smallBlind), bb: formatChips(header.bigBlind) })}
          {header.buttonName ? ` · ${t('panel.log.button', { name: header.buttonName })}` : ''}
        </span>
      </h3>
      <ol>
        {log.entries.map((entry) => (
          <LogRow key={entry.key} entry={entry} heroId={heroId} />
        ))}
      </ol>
    </section>
  );
}

const LogRow = memo(function LogRow({ entry, heroId }: { entry: HandLogEntry; heroId: string | null }) {
  switch (entry.kind) {
    case 'street':
      return <StreetRow entry={entry} />;
    case 'blind':
      return <BlindRow entry={entry} heroId={heroId} />;
    case 'action':
      return <ActionRow entry={entry} heroId={heroId} />;
  }
});

function StreetRow({ entry }: { entry: Extract<HandLogEntry, { kind: 'street' }> }) {
  const t = useT();
  return (
    <li className="mt-4 flex items-center gap-group first:mt-3">
      <span className="label-index text-micro text-brass">{t(`panel.log.street.${entry.street}`)}</span>
      <span aria-hidden className="h-px flex-1 bg-brass/35" />
      <MiniCards cards={entry.board} />
    </li>
  );
}

const ROW = 'grid min-h-[22px] grid-cols-[minmax(0,1fr)_52px_52px] items-center gap-x-2 text-body leading-[22px]';

function Name({ name, playerId, heroId }: { name: string; playerId: string; heroId: string | null }) {
  return (
    <span className={cn('truncate', playerId === heroId ? 'font-semibold text-text' : 'text-text-2')}>{name}</span>
  );
}

function BlindRow({ entry, heroId }: { entry: HandLogBlindEntry; heroId: string | null }) {
  const t = useT();
  return (
    <li className={cn(ROW, 'text-text-3')}>
      <span className="flex min-w-0 gap-tight">
        <Name name={entry.playerName} playerId={entry.playerId} heroId={heroId} />
        <span className="shrink-0">{t(`panel.log.blind.${entry.blind}`)}</span>
      </span>
      <span />
      <Amount value={entry.amount} className="text-text-3" />
    </li>
  );
}

function ActionRow({ entry, heroId }: { entry: HandLogActionEntry; heroId: string | null }) {
  const t = useT();
  return (
    <li className={ROW}>
      <span className="flex min-w-0 gap-tight">
        <Name name={entry.playerName} playerId={entry.playerId} heroId={heroId} />
        <span className={cn('shrink-0', TONE_CLASS[entry.tone])}>{t(`panel.log.verb.${entry.type}`)}</span>
      </span>
      <BetBar entry={entry} t={t} />
      {entry.amount !== null ? <Amount value={entry.amount} className="text-text" /> : <span />}
    </li>
  );
}

/** The labanotation mark: bar length = chips put in / pot before the bet, tick = one pot. */
function BetBar({ entry, t }: { entry: HandLogActionEntry; t: TFunction }) {
  if (entry.betRatio === null) return <span />;
  const width = Math.min(entry.betRatio, BAR_FULL_RATIO) / BAR_FULL_RATIO;
  const ratio = entry.betRatio >= 10 ? Math.round(entry.betRatio) : Math.round(entry.betRatio * 10) / 10;
  return (
    <span
      role="img"
      aria-label={t('panel.log.bet_size', { ratio: String(ratio) })}
      title={t('panel.log.bet_size', { ratio: String(ratio) })}
      className="relative block h-[3px] rounded-full bg-ink-3"
    >
      <span
        aria-hidden
        className={cn('absolute inset-y-0 left-0 rounded-full', BAR_CLASS[entry.tone])}
        style={{ width: `${Math.max(width, 0.04) * 100}%` }}
      />
      <span aria-hidden className="absolute -top-[2px] h-[7px] w-px bg-ink-8/70" style={{ left: `${(1 / BAR_FULL_RATIO) * 100}%` }} />
    </span>
  );
}

function Amount({ value, className }: { value: number; className?: string }) {
  return <span className={cn('font-index text-right text-lead tabular-nums', className)}>{formatChips(value)}</span>;
}

/** Two printed rules around the outcome, like the foot of a score sheet. */
function ResultBlock({ results, heroSummary }: { results: readonly HandLogResultLine[]; heroSummary: HeroHandSummary | null }) {
  const t = useT();
  const rankText = useRankText();
  const heroText = useHeroSummaryText();
  return (
    <div className="mt-4 space-y-group border-y border-brass/45 py-group">
      {results.map((line) => {
        const hand = rankText(line.handRankName);
        return (
          <div key={line.playerId} className="text-body">
            <p className="flex items-baseline gap-x-snug">
              <span className="min-w-0 flex-1 truncate font-semibold text-text">
                {line.playerName} <span className="font-normal text-text-2">{t('panel.log.wins')}</span>
              </span>
              <Amount value={line.amount} className="text-label font-semibold text-brass" />
            </p>
            {hand && <p className="text-text-2">{capitalize(hand)}</p>}
            {line.cards.length > 0 && <MiniCards cards={line.cards} className="mt-1" />}
          </div>
        );
      })}
      {heroSummary && (
        <p className="border-t border-line pt-snug text-body font-semibold text-text">{heroText(heroSummary)}</p>
      )}
    </div>
  );
}

function PastHandRow({ past, heroId }: { past: HandLogSummary; heroId: string | null }) {
  const t = useT();
  const rankText = useRankText();
  const heroText = useHeroSummaryText();
  const [open, setOpen] = useState(false);
  const [top] = past.results;
  const extra = past.results.length - 1;
  const net = past.hero?.net ?? null;
  const panelId = `past-hand-${past.handNumber}`;
  const label = open ? 'panel.log.past.hide' : 'panel.log.past.show';
  const rank = rankText(top?.handRankName);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t(label, { number: past.handNumber })}
        onClick={() => setOpen((value) => !value)}
        className="group flex min-h-[28px] w-full items-center gap-2 rounded-[var(--radius-stamp)] text-left text-body transition-colors duration-150 ease-out hover:bg-panel-2/60 focus-visible:bg-panel-2/60"
      >
        <svg
          viewBox="0 0 8 8"
          aria-hidden
          className={cn('size-2 shrink-0 text-text-3 transition-transform duration-150 ease-out motion-reduce:transition-none', open && 'rotate-90')}
        >
          <path d="M2 1l4 3-4 3z" fill="currentColor" />
        </svg>
        <span className="font-index w-9 shrink-0 text-lead font-semibold tabular-nums text-text-2">#{past.handNumber}</span>
        <span className="min-w-0 flex-1 truncate text-text-3">
          {top
            ? `${t('panel.log.past.won', { name: top.playerName, amount: formatChips(top.amount) })}${extra > 0 ? ` +${extra}` : ''}${rank ? ` · ${rank}` : ''}`
            : ''}
        </span>
        {net !== null && net !== 0 && (
          <span
            title={past.hero ? heroText(past.hero) : undefined}
            className={cn('font-index shrink-0 text-right text-lead tabular-nums', net > 0 ? 'text-brass' : 'text-text-2')}
          >
            {t('panel.log.past.net', { amount: `${net > 0 ? '+' : '−'}${formatChips(Math.abs(net))}` })}
          </span>
        )}
      </button>
      {open && (
        <div id={panelId} className="mb-2 ml-1 border-l border-line pl-3">
          <HandBlock log={past.log} heroId={heroId} />
          <ResultBlock results={past.log.results} heroSummary={past.hero} />
        </div>
      )}
    </li>
  );
}
