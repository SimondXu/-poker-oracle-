'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

interface RoomSeatCardProps {
  seatIndex: number;
  player: RoomPlayer | null;
  currentUserId: string;
  isPlaying: boolean;
  canManageBots: boolean;
  onAddBot: (strategy: BotPersonality, seatIndex: number) => void;
  onRemoveBot: (playerId: string) => void;
}

export function RoomSeatCard({
  seatIndex,
  player,
  currentUserId,
  isPlaying,
  canManageBots,
  onAddBot,
  onRemoveBot,
}: RoomSeatCardProps) {
  const [showBotMenu, setShowBotMenu] = useState(false);
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

  return (
    <div className="relative">
      <motion.div
        whileHover={!player && !isPlaying && canManageBots ? { scale: 1.015 } : {}}
        className={cn(
          'relative rounded-[20px] border transition-all duration-200',
          !player
            ? isPlaying
              ? 'border-white/8 bg-white/[0.015] opacity-45'
              : canManageBots
                ? 'cursor-pointer border-dashed border-white/22 bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/36 hover:bg-white/[0.05]'
                : 'border-dashed border-white/12 bg-white/[0.02]'
            : isMe
              ? 'border-[var(--color-gold)]/45 bg-[linear-gradient(145deg,rgba(255,215,0,0.14),rgba(255,215,0,0.05))]'
              : 'border-white/12 bg-[rgba(18,27,40,0.86)]',
        )}
        style={{
          minHeight: 96,
          boxShadow: 'var(--shadow-hairline)',
        }}
        onClick={() => {
          if (!player && !isPlaying && canManageBots) {
            setShowBotMenu(true);
          }
        }}
      >
        {!player ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 py-[18px]">
            <span className="text-[30px] leading-none text-[var(--color-text-dim)]">＋</span>
            <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">座位 {seatIndex + 1}</span>
            {!isPlaying && (
              <span className="text-[11px] text-[var(--color-text-muted)]">
                {canManageBots ? '添加机器人' : '仅房主可配置'}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4">
            <div
              className={cn(
                'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border text-base font-semibold shadow-[0_10px_20px_rgba(0,0,0,0.22)]',
                isMe
                  ? 'border-[var(--color-gold)]/38 bg-[radial-gradient(circle_at_top,rgba(255,215,0,0.2),rgba(11,17,26,0.98))] text-[var(--color-gold)]'
                  : 'border-white/12 bg-[rgba(7,14,22,0.9)] text-[var(--color-text-secondary)]',
              )}
            >
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_62%)]" />
              {avatarMeta?.src ? (
                <img src={avatarMeta.src} alt={avatarMeta.alt ?? ''} className="relative h-full w-full object-cover" />
              ) : (
                <span className="relative">{avatarMeta?.fallbackLabel ?? player.name.charAt(0).toUpperCase()}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">{player.name}</span>
                {isMe && (
                  <span className="rounded-full border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 px-2 py-0.5 text-[11px] text-[var(--color-gold)]">
                    你
                  </span>
                )}
              </div>
              <div className="mt-1">
                {player.isBot ? (
                  <span className="rounded-md bg-[var(--color-bg-elevated)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)]">
                    {personalityConfig?.label ?? 'Bot'} · {personalityConfig?.desc}
                  </span>
                ) : (
                  <span
                    className={cn(
                      'rounded-md px-2 py-1 text-[11px] font-medium',
                      player.isReady
                        ? 'bg-[var(--color-success-dim)] text-[var(--color-success)]'
                        : 'bg-white/6 text-[var(--color-text-dim)]',
                    )}
                  >
                    {player.isReady ? '✓ 已准备' : '未准备'}
                  </span>
                )}
              </div>
            </div>

            {player.isBot && !isPlaying && canManageBots && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveBot(player.id);
                }}
                className="shrink-0 rounded-lg p-1.5 text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-error-dim)] hover:text-[var(--color-error)]"
              >
                ✕
              </button>
            )}

            <div className="absolute right-3 top-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
              #{seatIndex + 1}
            </div>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showBotMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowBotMenu(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-[18px]"
              style={{
                background: 'rgba(14,22,35,0.96)',
                border: '1px solid var(--color-glass-border-strong)',
                boxShadow: 'var(--shadow-float)',
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
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all hover:bg-white/6"
                    onClick={() => {
                      onAddBot(personality.value, seatIndex);
                      setShowBotMenu(false);
                    }}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#0E1622] shadow-[0_8px_20px_rgba(0,0,0,0.24)]">
                      <img
                        src={botAvatar.src ?? '/avatars/bot-default.svg'}
                        alt={botAvatar.alt ?? `${personality.label} avatar`}
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <div>
                      <div className="text-[14px] font-medium text-[var(--color-text-primary)]">{personality.label}</div>
                      <div className="text-[12px] text-[var(--color-text-muted)]">{personality.desc}</div>
                    </div>
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
