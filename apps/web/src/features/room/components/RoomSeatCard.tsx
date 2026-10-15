'use client';

import { forwardRef } from 'react';
import { useT } from '@/i18n';
import { getPlayerAvatarMeta } from '@/lib/player-avatar';
import { cn } from '@/lib/utils';
import { getBotProfile } from '../lib/bot-profiles';
import type { RoomPlayer } from '../lib/room-socket-state';

interface RoomSeatCardProps {
  /** 1-based, for labels. */
  seatNumber: number;
  player: RoomPlayer | null;
  currentUserId: string;
  isPlaying: boolean;
  menuOpen: boolean;
  onOpenMenu: (anchor: HTMLElement) => void;
  /** Only the room host may remove bots; others never see the control. */
  canRemoveBots: boolean;
  onRemoveBot: (playerId: string) => void;
}

const PLATE_SIZE = 'w-[100px] min-[380px]:w-[104px] sm:w-[152px]';

/** One seat on the mini table: an ivory plate when taken, a dashed brass slot when open. */
export const RoomSeatCard = forwardRef<HTMLDivElement, RoomSeatCardProps>(function RoomSeatCard(
  { seatNumber, player, currentUserId, isPlaying, menuOpen, onOpenMenu, canRemoveBots, onRemoveBot },
  ref,
) {
  const t = useT();

  if (!player) {
    const canAddBot = !isPlaying;
    return (
      <div ref={ref} data-layout-box="room-seat" className={cn('relative', PLATE_SIZE)}>
        <button
          type="button"
          disabled={!canAddBot}
          onClick={(event) => onOpenMenu(event.currentTarget)}
          data-testid={canAddBot ? 'seat-add-bot' : undefined}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t(canAddBot ? 'lobby.room.seat.addAria' : 'lobby.room.seat.emptyAria', { seat: seatNumber })}
          className={cn(
            'flex h-[46px] w-full touch-manipulation select-none items-center justify-center gap-snug rounded-[var(--radius-control)] border border-dashed bg-ink-1/55 text-text-2 [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,border-color,color] duration-[var(--duration-fast)] ease-out active:scale-[0.97] motion-reduce:transition-none',
            menuOpen ? 'border-brass bg-ink-1/80 text-text' : 'border-brass/55 hover:border-brass hover:bg-ink-1/80 hover:text-text',
            !canAddBot && 'cursor-default opacity-45 hover:border-brass/55 hover:bg-ink-1/55 hover:text-text-2',
          )}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0 text-brass">
            <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="label-index text-micro">
            {t(canAddBot ? 'lobby.room.seat.add' : 'lobby.room.seat.empty')}
          </span>
        </button>
      </div>
    );
  }

  const isMe = player.id === currentUserId;
  const profile = player.isBot ? getBotProfile(player.botModel ?? player.botStrategy) : null;
  const displayName = profile ? t(profile.nameKey) : player.name;
  const avatar = getPlayerAvatarMeta({
    name: player.name,
    isBot: player.isBot,
    botStrategy: player.botStrategy,
    isHeroPlayer: isMe,
  });

  return (
    <div className={cn('relative', PLATE_SIZE)}>
      <div
        ref={ref}
        data-layout-box="room-seat"
        className={cn(
          'flex h-[46px] items-center gap-2 rounded-[var(--radius-control)] bg-ivory px-2 text-on-ivory shadow-plate',
          isMe && 'ring-2 ring-brass ring-offset-2 ring-offset-felt',
        )}
      >
        <span className="relative hidden size-7 shrink-0 overflow-hidden rounded-full border border-ivory-edge bg-ivory-shade sm:block sm:size-8">
          {avatar.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar.src} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center font-index text-lead font-bold">
              {avatar.fallbackLabel}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 leading-none">
          <span className="flex items-baseline gap-snug">
            <span className="font-index truncate text-lead font-bold leading-[1.1]">{displayName}</span>
            {isMe && (
              <span className="label-index shrink-0 text-micro tracking-caps-tight text-vermilion-ink">
                {t('lobby.room.seat.you')}
              </span>
            )}
          </span>
          <span className="mt-1 block truncate text-micro text-on-ivory-2">
            {profile
              ? t(profile.styleKey)
              : t(player.isReady ? 'lobby.room.seat.ready' : 'lobby.room.seat.notReady')}
          </span>
        </span>
        {!profile && (
          <span
            aria-hidden
            className={cn('size-2 shrink-0 rounded-full', player.isReady ? 'bg-positive' : 'bg-on-ivory-2/40')}
          />
        )}
      </div>

      {player.isBot && !isPlaying && canRemoveBots && (
        <button
          type="button"
          onClick={() => onRemoveBot(player.id)}
          aria-label={t('lobby.room.seat.remove', { name: displayName })}
          className="absolute -right-2 -top-2 flex size-6 touch-manipulation items-center justify-center rounded-full border border-line-2 bg-panel text-text-2 shadow-plate [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,color] duration-[var(--duration-fast)] ease-out before:absolute before:-inset-2.5 before:content-[''] hover:bg-vermilion hover:text-ivory active:scale-90 motion-reduce:transition-none"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
});
