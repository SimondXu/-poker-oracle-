'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { LocaleToggle } from '@/components/LocaleToggle';
import { useT, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { useGameStore } from '@/stores/gameStore';
import type { TopBarProps } from './slots';

type ConnectionStatus = ReturnType<typeof useGameStore.getState>['connectionStatus'];

const CONNECTION: Record<ConnectionStatus, { key: MessageKey; dot: string }> = {
  connected: { key: 'common.connection.connected', dot: 'bg-positive' },
  connecting: { key: 'common.connection.connecting', dot: 'bg-caution' },
  reconnecting: { key: 'common.connection.reconnecting', dot: 'bg-caution' },
  disconnected: { key: 'common.connection.disconnected', dot: 'bg-vermilion' },
};

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** Engraved spade mark, brass. Authored, 20px. */
function SpadeMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0 text-brass">
      <path d="M12 2.2c1.6 2.6 7.8 6.4 7.8 11.1a4.3 4.3 0 0 1-7 3.3c.1 1.9.7 3.4 1.7 4.7h-5c1-1.3 1.6-2.8 1.7-4.7a4.3 4.3 0 0 1-7-3.3C4.2 8.6 10.4 4.8 12 2.2z" />
    </svg>
  );
}

/** 48px top bar: wordmark, room code chip (copy), game label, hand number, connection, language. */
export function TopBar({
  roomCode,
  handNumber,
  smallBlind,
  bigBlind,
  onBack,
  onToggleHUD,
  isTrainingHUDVisible,
  onTogglePanel,
  isPanelOpen,
}: TopBarProps) {
  const t = useT();
  const connectionStatus = useGameStore((state) => state.connectionStatus);
  const copyRoomCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      toast(t('common.game.codeCopied'), { id: 'room-code-copied', duration: 1500 });
    } catch {
      toast.error(t('common.game.codeCopyFailed'), { id: 'room-code-copied' });
    }
  }, [roomCode, t]);

  const connection = CONNECTION[connectionStatus];
  const connectionLabel = t(connection.key);

  return (
    <header
      data-layout-box="top-bar"
      className="col-span-full flex h-12 min-w-0 items-center gap-2 overflow-hidden border-b border-line bg-panel px-3 sm:gap-3 md:px-4"
    >
      <button
        type="button"
        onClick={onBack}
        aria-label={t('common.game.backToLobby')}
        className="-ml-1.5 flex size-9 shrink-0 touch-manipulation items-center justify-center rounded-[var(--radius-control)] text-text-2 outline-offset-2 transition-colors duration-[var(--duration-fast)] hover:text-text focus-visible:outline-2 focus-visible:outline-[var(--color-brass)] md:hidden"
      >
        <svg width="18" height="18" {...ICON}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      <div className="flex min-w-0 shrink items-center gap-2">
        <SpadeMark />
        <span className="label-index hidden truncate text-label font-bold tracking-caps-wide text-text sm:inline">
          {t('common.appName')}
        </span>
      </div>

      <button
        type="button"
        onClick={copyRoomCode}
        title={t('common.game.roomCopyHint')}
        aria-label={t('common.game.roomAria', { code: roomCode })}
        data-layout-box="room-code"
        className="flex h-7 shrink-0 touch-manipulation items-center gap-tight rounded-[var(--radius-stamp)] border border-brass/50 px-2 outline-offset-2 transition-colors duration-[var(--duration-fast)] hover:border-brass focus-visible:outline-2 focus-visible:outline-[var(--color-brass)]"
      >
        <span className="label-index hidden text-micro text-text-3 sm:inline">{t('common.game.room')}</span>
        <span className="font-index text-body font-semibold uppercase tracking-caps-wide text-brass">{roomCode}</span>
        <svg width="12" height="12" {...ICON} strokeWidth={2} className="hidden shrink-0 text-text-3 sm:block">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </svg>
      </button>

      <span className="hidden shrink-0 items-baseline gap-tight font-index text-body text-text-2 lg:flex">
        <span className="label-index text-micro text-text-3">{t('common.game.nlhe')}</span>
        {smallBlind !== null && bigBlind !== null && (
          <span className="font-semibold text-text">{t('common.game.blinds', { small: smallBlind, big: bigBlind })}</span>
        )}
      </span>

      {handNumber !== null && (
        <>
          <span className="hidden shrink-0 items-baseline gap-tight font-index md:flex">
            <span className="label-index text-micro text-text-3">{t('common.game.hand')}</span>
            <span className="text-body font-semibold text-text">{handNumber}</span>
          </span>
          <span className="font-index shrink-0 text-body font-semibold text-text-2 md:hidden">
            {t('common.game.handShort', { number: handNumber })}
          </span>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <span
          role="status"
          aria-label={t('common.game.connectionAria', { state: connectionLabel })}
          title={connectionLabel}
          className="hidden items-center gap-tight text-body text-text-3 sm:flex"
        >
          <span className={cn('size-2 rounded-full', connection.dot)} aria-hidden />
          <span className="hidden md:inline">{connectionLabel}</span>
        </span>

        <LocaleToggle />

        {/* Below md the rail is hidden; the top bar carries its coach toggle. */}
        <button
          type="button"
          onClick={onToggleHUD}
          aria-pressed={isTrainingHUDVisible}
          aria-label={t('common.rail.coach')}
          title={t('common.rail.coach')}
          data-layout-box="coach-toggle"
          className="flex size-9 touch-manipulation items-center justify-center rounded-[var(--radius-control)] border border-line-2 text-text-2 outline-offset-2 transition-colors duration-[var(--duration-fast)] hover:text-text focus-visible:outline-2 focus-visible:outline-[var(--color-brass)] aria-pressed:border-brass/60 aria-pressed:text-text md:hidden"
        >
          <svg width="18" height="18" {...ICON}>
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onTogglePanel}
          aria-expanded={isPanelOpen}
          aria-label={t('common.panel.sheetOpen')}
          title={t('common.panel.sheetOpen')}
          data-layout-box="panel-sheet-button"
          className="flex size-9 touch-manipulation items-center justify-center rounded-[var(--radius-control)] border border-line-2 text-text-2 outline-offset-2 transition-colors duration-[var(--duration-fast)] hover:text-text focus-visible:outline-2 focus-visible:outline-[var(--color-brass)] aria-expanded:border-brass/60 aria-expanded:text-text md:hidden"
        >
          <svg width="18" height="18" {...ICON}>
            <rect x="4" y="3.5" width="16" height="17" rx="2" />
            <path d="M8 8.5h8M8 12.5h8M8 16.5h5" />
          </svg>
        </button>
      </div>
    </header>
  );
}
