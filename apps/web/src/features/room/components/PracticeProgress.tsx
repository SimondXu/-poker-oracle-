'use client';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { PracticeSetup } from '../hooks/usePracticeSetup';
import { primaryButton, secondaryButton } from '../lib/room-ui';

interface PracticeProgressProps {
  setup: PracticeSetup;
  isConnected: boolean;
  onManual: () => void;
}

/** Panel body while Practice now sets the table up: a progress line, or the failure with a way out. */
export function PracticeProgress({ setup, isConnected, onManual }: PracticeProgressProps) {
  const t = useT();
  const { phase, seated, total, errorKey, retry } = setup;

  if (phase === 'failed') {
    return (
      <section aria-label={t('lobby.room.practice.failedTitle')} className="space-y-4 p-4 sm:p-5">
        <div role="alert" className="space-y-1">
          <p className="text-lead font-semibold text-text">{t('lobby.room.practice.failedTitle')}</p>
          {errorKey && <p className="text-body text-vermilion-hi">{t(errorKey)}</p>}
        </div>
        <div className="grid grid-cols-2 gap-snug">
          <button type="button" onClick={onManual} className={secondaryButton}>
            {t('lobby.room.practice.manual')}
          </button>
          <button type="button" onClick={retry} className={primaryButton}>
            {t('lobby.room.practice.retry')}
          </button>
        </div>
      </section>
    );
  }

  const message =
    !isConnected || phase === 'idle'
      ? t('lobby.room.status.connecting')
      : phase === 'seating'
        ? t('lobby.room.practice.seating', { count: seated, total })
        : phase === 'readying'
          ? t('lobby.room.practice.readying')
          : t('lobby.room.practice.dealing');
  const fraction = phase === 'seating' || phase === 'idle' ? seated / (total + 2) : phase === 'readying' ? (total + 1) / (total + 2) : 1;

  return (
    <section aria-label={t('lobby.home.practice')} className="space-y-3 p-4 sm:p-5">
      <p role="status" className="text-lead text-text">
        {message}
      </p>
      <div className="h-1 overflow-hidden rounded-full bg-panel-2" aria-hidden>
        <div
          className={cn('h-full origin-left rounded-full bg-brass transition-transform duration-[var(--duration-normal)] ease-out motion-reduce:transition-none')}
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
    </section>
  );
}
