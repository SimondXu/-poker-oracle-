'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { secondaryButtonCompact } from '../lib/room-ui';

interface RoomInviteCardProps {
  roomId: string;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function RoomInviteCard({ roomId }: RoomInviteCardProps) {
  const t = useT();
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(async () => {
    const ok = await writeClipboard(roomId);
    setStatus(ok ? 'copied' : 'failed');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus('idle'), 1800);
  }, [roomId]);

  return (
    <section aria-labelledby="room-invite-title" className="border-t border-line p-4 sm:p-5">
      <h2 id="room-invite-title" className="label-index text-micro text-text-3">
        {t('lobby.room.invite.title')}
      </h2>
      <div className="mt-2 flex items-stretch gap-2">
        <span
          className="font-index flex h-12 min-w-0 flex-1 items-center justify-center rounded-[var(--radius-control)] border border-brass/40 bg-page px-3 text-title font-semibold tracking-caps-wide text-text select-all"
        >
          {roomId}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={cn(secondaryButtonCompact, 'w-[104px] shrink-0', status === 'copied' && 'border-brass text-brass')}
        >
          {status === 'copied' ? t('common.button.copied') : status === 'failed' ? t('lobby.room.invite.copyFailed') : t('common.button.copy')}
        </button>
      </div>
      <p className="mt-2 text-body text-text-3 max-sm:hidden" aria-live="polite">
        {t('lobby.room.invite.hint')}
      </p>
    </section>
  );
}
