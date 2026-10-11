'use client';

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { HandState } from '@aipoker/shared';
import { cn, formatChips } from '@/lib/utils';
import type { HandResult } from '@/stores/gameStore';
import { shouldShowWinnerIdentity } from '../../lib/table-animation';
import { selectPastHands } from '../../lib/hand-log-history';
import {
  buildHandLog,
  formatHandHeader,
  formatResultLine,
  type HandLogActionEntry,
  type HandLogEntry,
  type HandLogResultLine,
  type HandLogTone,
} from '../../lib/hand-log-model';
import { MiniCards } from './MiniCards';
import { useHandLogHistory } from './useHandLogHistory';

const TONE_CLASS: Record<HandLogTone, string> = {
  fold: 'text-[#d96a6a]',
  check: 'text-text-2',
  call: 'text-[#6ea0f2]',
  raise: 'text-[#4fc56b]',
  allin: 'font-bold text-[#ff5757]',
};

const STICK_THRESHOLD_PX = 48;

interface HandLogViewProps {
  hand: HandState | null;
  handResult: HandResult | null | undefined;
  className?: string | undefined;
}

export const HandLogView = memo(function HandLogView({ hand, handResult, className }: HandLogViewProps) {
  // Only reveal winners once the table animation has: no spoilers before showdown.
  const visibleResult = hand?.phase === 'hand_end' && handResult && shouldShowWinnerIdentity(handResult.phase)
    ? handResult
    : null;
  const log = useMemo(() => (hand ? buildHandLog(hand, visibleResult) : null), [hand, visibleResult]);
  const history = useHandLogHistory(hand, visibleResult);
  const pastHands = selectPastHands(history, hand?.roomId ?? null, hand?.handNumber ?? null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastLineCount = log ? log.entries.length + log.results.length : 0;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [lastLineCount, pastHands.length, hand?.handNumber]);

  // A new hand always snaps back to the bottom.
  useEffect(() => {
    stickToBottomRef.current = true;
  }, [hand?.handNumber]);

  if (!hand || !log) {
    return <p className={cn('px-3 py-4 text-[13px] text-text-3', className)}>等待游戏开始...</p>;
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const el = event.currentTarget;
        stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
      }}
      role="log"
      aria-label="牌局记录"
      className={cn('min-h-0 overflow-y-auto overscroll-contain py-2', className)}
    >
      {pastHands.map((past) => (
        <PastHandLine key={`${past.roomId}-${past.handNumber}`} number={past.handNumber} results={past.results} />
      ))}

      <h3 className="mx-3 mb-1 mt-2 border-b border-line pb-1 text-[12px] font-semibold text-text-2 first:mt-0">
        {formatHandHeader(log.header)}
      </h3>

      <ol>
        {log.entries.map((entry) => (
          <LogRow key={entry.key} entry={entry} />
        ))}
      </ol>

      {log.results.length > 0 && (
        <div className="mx-3 mt-2 space-y-1 border-t border-line pt-2">
          {log.results.map((line) => (
            <ResultRow key={line.playerId} line={line} />
          ))}
        </div>
      )}
    </div>
  );
});

function PastHandLine({ number, results }: { number: number; results: readonly HandLogResultLine[] }) {
  const [top] = results;
  const extra = results.length - 1;
  return (
    <p className="truncate px-3 py-0.5 text-[12px] leading-5 text-text-3">
      <span className="tabular-nums">第 {number} 手</span>
      {top ? (
        <>
          {' · '}
          {formatResultLine(top)}
          {extra > 0 ? ` +${extra}` : ''}
        </>
      ) : null}
    </p>
  );
}

function LogRow({ entry }: { entry: HandLogEntry }) {
  switch (entry.kind) {
    case 'street':
      return (
        <li className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-3 pt-1.5 text-[12px] leading-5 first:mt-0 first:border-t-0">
          <span className="font-semibold uppercase tracking-wide text-text-2">{entry.label}</span>
          <MiniCards cards={entry.board} />
        </li>
      );
    case 'blind':
      return (
        <li className="px-3 py-0.5 text-[13px] leading-5 text-text-3">
          <span className="font-semibold text-text-2">{entry.playerName}</span> {entry.label}{' '}
          <span className="tabular-nums">{entry.amount}</span>
        </li>
      );
    case 'action':
      return <ActionRow entry={entry} />;
  }
}

function ActionRow({ entry }: { entry: HandLogActionEntry }) {
  return (
    <li className="px-3 py-0.5 text-[13px] leading-5 text-text">
      <span className="font-bold">{entry.playerName}</span>{' '}
      <span className={TONE_CLASS[entry.tone]}>{entry.verb}</span>
      {entry.amount ? <span className="font-semibold tabular-nums"> {entry.amount}</span> : null}
    </li>
  );
}

function ResultRow({ line }: { line: HandLogResultLine }) {
  return (
    <div className="rounded-[var(--radius-panel)] bg-panel-2 px-2 py-1.5 text-[13px] leading-5">
      <span className="font-bold text-text">{line.playerName}</span>
      <span className="text-text-2"> 赢得 </span>
      <span className="font-bold tabular-nums text-chip">{formatChips(line.amount)}</span>
      {line.handRankName ? <span className="text-text-2"> · {line.handRankName}</span> : null}
      {line.cards.length > 0 ? <MiniCards cards={line.cards} className="mt-1 flex" /> : null}
    </div>
  );
}
