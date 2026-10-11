'use client';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { getRoomStatusKey } from '../lib/room-page-state';
import { primaryButton, secondaryButton } from '../lib/room-ui';

interface RoomControlsCardProps {
  isPlaying: boolean;
  isConnected: boolean;
  isReady: boolean;
  canSelfStart: boolean;
  canStart: boolean;
  hasEnoughPlayers: boolean;
  allHumansReady: boolean;
  isTableFinished: boolean;
  onMarkReady: () => void;
  onStartGame: () => void;
  onEnterGame: () => void;
}

export function RoomControlsCard({
  isPlaying,
  isConnected,
  isReady,
  canSelfStart,
  canStart,
  hasEnoughPlayers,
  allHumansReady,
  isTableFinished,
  onMarkReady,
  onStartGame,
  onEnterGame,
}: RoomControlsCardProps) {
  const t = useT();
  const statusKey = getRoomStatusKey({
    isConnected,
    isPlaying,
    isTableFinished,
    canSelfStart,
    hasEnoughPlayers,
    isReady,
    allHumansReady,
  });
  const isGo = statusKey === 'lobby.room.status.canStart';

  return (
    <section aria-label={t('lobby.room.title')} className="space-y-4 p-4 sm:p-5">
      <p role="status" className="flex items-start gap-snug text-lead text-text">
        <span
          aria-hidden
          className={cn('mt-[7px] size-2 shrink-0 rounded-full', isGo ? 'bg-positive' : isConnected ? 'bg-brass' : 'bg-vermilion')}
        />
        {t(statusKey)}
      </p>

      {!isPlaying ? (
        <div className="grid grid-cols-2 gap-snug">
          <button
            type="button"
            onClick={onMarkReady}
            data-testid="room-ready"
            disabled={isReady || !isConnected || !canSelfStart}
            className={cn(secondaryButton, isReady && canSelfStart && 'border-positive/60 text-positive disabled:opacity-100')}
          >
            {isReady && canSelfStart && (
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {canSelfStart ? t(isReady ? 'lobby.room.readyDone' : 'lobby.room.ready') : t('lobby.room.eliminated')}
          </button>
          <button
            type="button"
            onClick={onStartGame}
            disabled={!canStart || !isConnected}
            data-testid="room-start"
            className={primaryButton}
          >
            {t('lobby.room.start')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={onEnterGame} className={primaryButton}>
          {t('lobby.room.enter')}
        </button>
      )}

      {!isPlaying && !canSelfStart && (
        <button type="button" onClick={onEnterGame} className={secondaryButton}>
          {t('lobby.room.spectate')}
        </button>
      )}
    </section>
  );
}
