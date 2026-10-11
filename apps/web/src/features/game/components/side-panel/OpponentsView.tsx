'use client';

import { memo, useMemo } from 'react';
import type { HandState, PlayerState } from '@aipoker/shared';
import { useT } from '@/i18n';
import { cn, formatChips } from '@/lib/utils';
import {
  computeOpponentStats,
  MIN_HANDS_FOR_STATS,
  type HandObservation,
  type OpponentStats,
} from '../../lib/opponent-stats';
import { useHandObservations } from './session-history';

type StyleKey = 'fish' | 'tag' | 'lag' | 'bot' | 'player';

function styleOf(player: PlayerState): StyleKey {
  if (!player.isBot) return 'player';
  const strategy = player.botStrategy;
  return strategy === 'fish' || strategy === 'tag' || strategy === 'lag' ? strategy : 'bot';
}

interface OpponentsViewProps {
  hand: HandState | null;
  heroId: string | null;
  className?: string | undefined;
}

export const OpponentsView = memo(function OpponentsView({ hand, heroId, className }: OpponentsViewProps) {
  const t = useT();
  const observations = useHandObservations();
  const roomId = hand?.roomId ?? null;
  const opponents = useMemo(
    () => (hand ? hand.players.filter((player) => player.id !== heroId).sort((a, b) => a.seatIndex - b.seatIndex) : []),
    [hand, heroId],
  );

  if (opponents.length === 0) {
    return <p className={cn('px-4 py-5 text-body text-text-3', className)}>{t('panel.opp.empty')}</p>;
  }

  return (
    <div className={cn('min-h-0 overflow-y-auto px-4 pb-2 pt-1', className)}>
      <ul aria-label={t('panel.opp.label')}>
        {opponents.map((player) => (
          <OpponentRow key={player.id} player={player} observations={observations} roomId={roomId} />
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-body text-text-3">
        {t('panel.opp.legend')} {t('panel.opp.sample', { min: MIN_HANDS_FOR_STATS })}
      </p>
    </div>
  );
});

function OpponentRow({
  player,
  observations,
  roomId,
}: {
  player: PlayerState;
  observations: readonly HandObservation[];
  roomId: string | null;
}) {
  const t = useT();
  const style = styleOf(player);
  const stats = useMemo(() => computeOpponentStats(observations, player.id, roomId), [observations, player.id, roomId]);
  const isOut = player.status === 'out' || player.status === 'sitting_out';

  return (
    <li className={cn('border-b border-line py-3 last:border-b-0', isOut && 'opacity-55')}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-lead font-semibold text-text">{player.name}</span>
        <span className="label-index shrink-0 rounded-[var(--radius-stamp)] border border-brass/60 px-1.5 py-[3px] text-micro text-brass">
          {t(`panel.opp.style.${style}`)}
        </span>
        <span className="ml-auto shrink-0 text-right">
          {isOut ? (
            <span className="label-index text-micro text-text-3">{t('panel.opp.out')}</span>
          ) : (
            <span className="font-index text-value font-semibold tabular-nums text-text">
              <span className="sr-only">{t('panel.opp.stack')} </span>
              {formatChips(player.stack)}
            </span>
          )}
        </span>
      </div>
      <p className="mt-1 text-body text-text-3">{t(`panel.opp.about.${style}`)}</p>
      <dl className="mt-2 grid grid-cols-4 gap-x-2">
        <Stat label={t('panel.opp.hands')} text={String(stats.hands)} />
        <Stat label={t('panel.opp.stat.vpip')} text={asPercent(stats.vpip)} missing={stats.vpip === null} />
        <Stat label={t('panel.opp.stat.pfr')} text={asPercent(stats.pfr)} missing={stats.pfr === null} />
        <Stat label={t('panel.opp.stat.agg')} text={asPercent(stats.aggression)} missing={stats.aggression === null} />
      </dl>
    </li>
  );
}

function asPercent(value: OpponentStats['vpip']): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function Stat({ label, text, missing }: { label: string; text: string; missing?: boolean }) {
  const t = useT();
  return (
    <div>
      <dt className="label-index text-micro text-text-3">{label}</dt>
      <dd className={cn('font-index mt-hair text-label font-semibold tabular-nums', missing ? 'text-text-3' : 'text-text')}>
        {text}
        {missing ? <span className="sr-only"> {t('panel.opp.no_stat')}</span> : null}
      </dd>
    </div>
  );
}
