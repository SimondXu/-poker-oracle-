'use client';

import { cn } from '@/lib/utils';
import { getPlayerAvatarMeta } from '@/lib/player-avatar';
import type { BotPersonality } from '@aipoker/shared';
import type { RoomPlayer } from '../lib/room-socket-state';

const BOT_PERSONALITIES: Array<{
  value: BotPersonality;
  label: string;
  desc: string;
}> = [
  { value: 'fish', label: 'Fish', desc: '松散被动' },
  { value: 'tag', label: 'TAG', desc: '紧凶' },
  { value: 'lag', label: 'LAG', desc: '松凶' },
];

export type MenuSide = 'above' | 'below';
export type MenuAlign = 'left' | 'center' | 'right';

interface RoomSeatCardProps {
  seatIndex: number;
  player: RoomPlayer | null;
  currentUserId: string;
  isPlaying: boolean;
  menuSide?: MenuSide;
  menuAlign?: MenuAlign;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onAddBot: (strategy: BotPersonality, seatIndex: number) => void;
  onRemoveBot: (playerId: string) => void;
}

const MENU_ALIGN_CLASS: Record<MenuAlign, string> = {
  left: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-0',
};

export function RoomSeatCard({
  seatIndex,
  player,
  currentUserId,
  isPlaying,
  menuSide = 'below',
  menuAlign = 'center',
  menuOpen,
  onMenuOpenChange,
  onAddBot,
  onRemoveBot,
}: RoomSeatCardProps) {
  const isMe = player?.id === currentUserId;
  const personalityConfig = BOT_PERSONALITIES.find((personality) => personality.value === player?.botStrategy);
  const avatarMeta = player
    ? getPlayerAvatarMeta({
        name: player.name,
        isBot: player.isBot,
        botStrategy: player.botStrategy,
        isHeroPlayer: isMe,
      })
    : null;

  const canAddBot = !player && !isPlaying;

  return (
    <div className="relative flex w-[70px] flex-col items-center sm:w-[108px]">
      {!player ? (
        <button
          type="button"
          disabled={!canAddBot}
          onClick={() => onMenuOpenChange(!menuOpen)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`座位 ${seatIndex + 1}${canAddBot ? '：添加机器人' : '：空位'}`}
          className={cn(
            'group flex flex-col items-center gap-1 rounded-panel p-1',
            canAddBot ? 'cursor-pointer' : 'cursor-default opacity-40',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-white/50 text-[22px] leading-none text-white/80 sm:h-12 sm:w-12',
              canAddBot && 'group-hover:border-white group-hover:bg-black/20',
            )}
          >
            +
          </span>
          <span className="text-[11px] font-medium leading-tight text-white/85 sm:text-[12px]">
            {canAddBot ? '添加机器人' : '空位'}
          </span>
        </button>
      ) : (
        <div className="relative flex w-full flex-col items-center">
          <div
            className={cn(
              'relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 bg-panel text-base font-semibold text-text-2 sm:h-12 sm:w-12',
              isMe ? 'border-chip' : 'border-plate',
            )}
          >
            {avatarMeta?.src ? (
              <img src={avatarMeta.src} alt={avatarMeta.alt ?? ''} className="h-full w-full object-cover" />
            ) : (
              <span>{avatarMeta?.fallbackLabel ?? player.name.charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="-mt-2 w-full rounded-panel bg-plate px-1 py-1 sm:px-2 text-center shadow-plate">
            <div className="flex items-center justify-center gap-1">
              <span className="truncate text-[11px] font-semibold leading-tight text-plate-text sm:text-[12px]">{player.name}</span>
              {isMe && <span className="shrink-0 text-[10px] font-medium leading-tight text-accent">你</span>}
            </div>
            <div className="mt-0.5 truncate text-[10px] leading-tight text-[#5b606a] sm:text-[11px]">
              {player.isBot
                ? `${personalityConfig?.label ?? 'Bot'} · ${personalityConfig?.desc ?? ''}`
                : player.isReady
                  ? '已准备'
                  : '未准备'}
            </div>
          </div>

          {player.isBot && !isPlaying && (
            <button
              type="button"
              onClick={() => onRemoveBot(player.id)}
              aria-label={`移除机器人 ${player.name}`}
              className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-panel text-[11px] text-text-2 hover:bg-fold hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {menuOpen && canAddBot && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onMenuOpenChange(false)} aria-hidden="true" />
          <div
            role="menu"
            aria-label={`座位 ${seatIndex + 1} 添加机器人`}
            className={cn(
              'absolute z-50 w-[168px] overflow-hidden rounded-panel border border-line bg-panel shadow-float',
              MENU_ALIGN_CLASS[menuAlign],
              menuSide === 'below' ? 'top-full mt-1' : 'bottom-full mb-1',
            )}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onMenuOpenChange(false);
            }}
          >
            {BOT_PERSONALITIES.map((personality) => {
              const botAvatar = getPlayerAvatarMeta({
                name: personality.label,
                isBot: true,
                botStrategy: personality.value,
              });

              return (
                <button
                  key={personality.value}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-panel-2"
                  onClick={() => {
                    onAddBot(personality.value, seatIndex);
                    onMenuOpenChange(false);
                  }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-page">
                    <img
                      src={botAvatar.src ?? '/avatars/bot-default.svg'}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium leading-tight text-text">{personality.label}</span>
                    <span className="block text-[12px] leading-tight text-text-3">{personality.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
