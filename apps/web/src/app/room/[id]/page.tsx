'use client';

import { use, useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoomSocket, type RoomPlayer } from '@/hooks/useRoomSocket';
import { useAuthStore } from '@/stores/authStore';
import type { BotPersonality } from '@aipoker/shared';

interface RoomPageProps {
  params: Promise<{ id: string }>;
}

const MAX_SEATS = 6;

const BOT_PERSONALITIES: {
  value: BotPersonality;
  label: string;
  emoji: string;
  desc: string;
}[] = [
  { value: 'fish', label: 'Fish', emoji: '🐟', desc: '松散被动' },
  { value: 'tag', label: 'TAG', emoji: '🎯', desc: '紧凶' },
  { value: 'lag', label: 'LAG', emoji: '🔥', desc: '松凶' },
];

function SeatCard({
  seatIndex,
  player,
  currentUserId,
  isPlaying,
  onAddBot,
  onRemoveBot,
}: {
  seatIndex: number;
  player: RoomPlayer | null;
  currentUserId: string;
  isPlaying: boolean;
  onAddBot: (strategy: BotPersonality, seatIndex: number) => void;
  onRemoveBot: (playerId: string) => void;
}) {
  const [showBotMenu, setShowBotMenu] = useState(false);

  const isMe = player?.id === currentUserId;
  const personalityConfig = BOT_PERSONALITIES.find((p) => p.value === player?.botStrategy);

  return (
    <div className="relative">
      <motion.div
        whileHover={!player && !isPlaying ? { scale: 1.015 } : {}}
        className={[
          'relative rounded-[20px] border transition-all duration-200',
          !player
            ? isPlaying
              ? 'border-white/8 bg-white/[0.015] opacity-45'
              : 'cursor-pointer border-dashed border-white/22 bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/36 hover:bg-white/[0.05]'
            : isMe
              ? 'border-[var(--color-gold)]/45 bg-[linear-gradient(145deg,rgba(255,215,0,0.14),rgba(255,215,0,0.05))]'
              : 'border-white/12 bg-[rgba(18,27,40,0.86)]',
        ].join(' ')}
        style={{
          minHeight: 96,
          boxShadow: 'var(--shadow-hairline)',
        }}
        onClick={() => {
          if (!player && !isPlaying) setShowBotMenu(true);
        }}
      >
        {!player ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 py-[18px]">
            <span className="text-[30px] leading-none text-[var(--color-text-dim)]">＋</span>
            <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">座位 {seatIndex + 1}</span>
            {!isPlaying && (
              <span className="text-[11px] text-[var(--color-text-muted)]">添加机器人</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4">
            {/* Avatar */}
            <div
              className={[
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-semibold',
                isMe
                  ? 'bg-[var(--color-gold)]/22 text-[var(--color-gold)]'
                  : 'bg-white/[0.08] text-[var(--color-text-secondary)]',
              ].join(' ')}
            >
              {player.isBot
                ? (personalityConfig?.emoji ?? '🤖')
                : player.name.charAt(0).toUpperCase()}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
                  {player.name}
                </span>
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
                    className={[
                      'rounded-md px-2 py-1 text-[11px] font-medium',
                      player.isReady
                        ? 'bg-[var(--color-success-dim)] text-[var(--color-success)]'
                        : 'bg-white/6 text-[var(--color-text-dim)]',
                    ].join(' ')}
                  >
                    {player.isReady ? '✓ 已准备' : '未准备'}
                  </span>
                )}
              </div>
            </div>

            {/* Remove bot */}
            {player.isBot && !isPlaying && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveBot(player.id);
                }}
                className="shrink-0 rounded-lg p-1.5 text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-error-dim)] hover:text-[var(--color-error)]"
              >
                ✕
              </button>
            )}

            {/* Seat number */}
            <div className="absolute right-3 top-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
              #{seatIndex + 1}
            </div>
          </div>
        )}
      </motion.div>

      {/* Bot personality dropdown */}
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
              {BOT_PERSONALITIES.map((p) => (
                <button
                  key={p.value}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all hover:bg-white/6"
                  onClick={() => {
                    onAddBot(p.value, seatIndex);
                    setShowBotMenu(false);
                  }}
                >
                  <span className="text-xl">{p.emoji}</span>
                  <div>
                    <div className="text-[14px] font-medium text-[var(--color-text-primary)]">
                      {p.label}
                    </div>
                    <div className="text-[12px] text-[var(--color-text-muted)]">{p.desc}</div>
                  </div>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function RoomPage({ params }: RoomPageProps) {
  const { id: roomId } = use(params);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) router.replace('/');
  }, [user, router]);

  const playerId = user?.id ?? '';
  const playerName = user?.username ?? '';

  const { roomState, isConnected, isReady, addBot, removeBot, markReady, startGame } =
    useRoomSocket(roomId, playerId, playerName);

  const humanPlayers = roomState?.players.filter((p) => !p.isBot) ?? [];
  const allHumansReady = humanPlayers.length > 0 && humanPlayers.every((p) => p.isReady);
  const hasEnoughPlayers = (roomState?.playerCount ?? 0) >= 2;
  const activeStackPlayerCount = roomState?.table.activeStackPlayerCount ?? 0;
  const isTableFinished = roomState?.table.isTableFinished ?? false;
  const selfPlayer = roomState?.players.find((p) => p.id === playerId) ?? null;
  const canSelfStart = selfPlayer ? (!selfPlayer.isBot && selfPlayer.stack > 0) : true;
  const canStart = allHumansReady
    && hasEnoughPlayers
    && !roomState?.isPlaying
    && canSelfStart
    && (roomState?.table.canStartNextHand ?? hasEnoughPlayers);

  const handleStartGame = useCallback(() => {
    startGame(() => router.push(`/game/${roomId}`));
  }, [startGame, router, roomId]);

  const playerBySeat = new Map(roomState?.players.map((p) => [p.seatIndex, p]) ?? []);

  if (!user) return null;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-12 top-10 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-12 bottom-10 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Header */}
      <header
        className="sticky top-0 z-20 border-b border-white/6 bg-[var(--color-bg-deep)]/70 backdrop-blur-xl"
      >
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <motion.button
              whileHover={{ y: -1.5, scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/')}
              aria-label="返回大厅"
              className={[
                'group relative flex h-10 items-center gap-2.5 overflow-hidden rounded-[12px] border px-3.5 sm:h-11',
                'border-white/14 bg-[rgba(12,20,31,0.84)] text-[var(--color-text-secondary)]',
                'transition-all duration-200',
                'shadow-[var(--shadow-hairline),0_8px_18px_rgba(0,0,0,0.32)]',
                'hover:border-[var(--color-gold)]/42 hover:bg-[rgba(16,25,38,0.9)] hover:text-[var(--color-text-primary)] hover:shadow-[var(--shadow-hairline),0_12px_24px_rgba(0,0,0,0.4)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2d58a]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-deep)]',
              ].join(' ')}
            >
              <span className="pointer-events-none absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-white/24 to-transparent" />
              <span className="relative flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/12 bg-white/[0.03] text-[var(--color-gold)] transition-all duration-200 group-hover:border-[var(--color-gold)]/35 group-hover:bg-[var(--color-gold)]/10">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M14.5 6.5L9 12L14.5 17.5"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="relative text-[12px] font-semibold tracking-[0.08em] text-[var(--color-text-primary)] sm:text-[13px]">
                返回大厅
              </span>
            </motion.button>
            <div className="flex items-center gap-2">
              <span className="text-lg text-[var(--color-gold)]">♠</span>
              <span className="font-display text-[20px] leading-none text-[var(--color-text-primary)]">
                AiPoker
              </span>
            </div>
            <div className="h-5 w-px bg-white/10" />
            <span className="hidden font-mono text-[12px] tracking-[0.08em] text-[var(--color-text-muted)] sm:inline">
              {roomId.slice(0, 14)}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                isConnected ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'
              }`}
            />
            <span className="hidden text-[13px] text-[var(--color-text-secondary)] sm:inline">
              {isConnected ? '已连接' : '连接中…'}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-[1240px] px-5 pb-10 pt-8 sm:px-8 sm:pb-12 lg:px-12 lg:pt-10">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-8">
          <div className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-[38px] leading-[1.02] text-[var(--color-text-primary)] sm:text-[44px]">
                  训练室配置
                </h1>
                <p className="mt-2 text-[15px] leading-[1.7] text-[var(--color-text-secondary)]">
                  先安排玩家和机器人风格，开始前确保真人玩家全部准备。
                </p>
              </div>
              {!roomState?.isPlaying && (
                <span className="hidden rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-[12px] text-[var(--color-text-muted)] sm:inline-flex">
                  点击空位添加机器人
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {Array.from({ length: MAX_SEATS }, (_, seatIndex) => (
                <SeatCard
                  key={seatIndex}
                  seatIndex={seatIndex}
                  player={playerBySeat.get(seatIndex) ?? null}
                  currentUserId={playerId}
                  isPlaying={roomState?.isPlaying ?? false}
                  onAddBot={addBot}
                  onRemoveBot={removeBot}
                />
              ))}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section
              className="rounded-[24px] border border-white/12 bg-[rgba(10,18,30,0.85)] p-5 sm:p-6"
              style={{ boxShadow: 'var(--shadow-panel), var(--shadow-hairline)' }}
            >
              <h2 className="text-[12px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">房间状态</h2>
              <div className="mt-4 grid grid-cols-4 gap-2">
                <Stat label="玩家数" value={roomState?.playerCount ?? 0} />
                <Stat
                  label="已准备"
                  value={roomState ? humanPlayers.filter((p) => p.isReady).length : 0}
                  color="var(--color-success)"
                />
                <Stat
                  label="有效筹码"
                  value={activeStackPlayerCount}
                  color="var(--color-gold)"
                />
                <div className="text-center">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">状态</div>
                  <div
                    className="mt-2 text-[17px] font-semibold"
                    style={{
                      color: roomState?.isPlaying ? 'var(--color-gold)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {roomState?.isPlaying ? '游戏中' : '等待中'}
                  </div>
                </div>
              </div>
            </section>

            <section
              className="rounded-[24px] border border-white/12 bg-[rgba(10,18,30,0.85)] p-5 sm:p-6"
              style={{ boxShadow: 'var(--shadow-panel), var(--shadow-hairline)' }}
            >
              <h3 className="text-[12px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">开局控制</h3>
              <div className="mt-4 space-y-3.5">
                {isTableFinished && (
                  <div className="rounded-xl border border-[var(--color-gold)]/32 bg-[var(--color-gold)]/10 px-3 py-2 text-[12px] leading-[1.55] text-[var(--color-text-secondary)]">
                    本场已结束，请返回大厅重新建局。
                  </div>
                )}

                {!roomState?.isPlaying && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={markReady}
                    disabled={isReady || !isConnected || !canSelfStart}
                    className={[
                      'h-[50px] w-full rounded-[14px] border text-[15px] font-semibold transition-all',
                      isReady
                        ? 'cursor-default border-[var(--color-success)]/45 bg-[var(--color-success-dim)] text-[var(--color-success)]'
                        : 'border-[var(--color-success)]/30 bg-[rgba(76,175,80,0.1)] text-[var(--color-success)] hover:border-[var(--color-success)]/45 hover:bg-[rgba(76,175,80,0.16)]',
                      (!isConnected || !canSelfStart) && 'cursor-not-allowed opacity-50',
                    ].join(' ')}
                  >
                    {canSelfStart ? (isReady ? '✓ 已准备' : '我已准备') : '已淘汰'}
                  </motion.button>
                )}

                {!roomState?.isPlaying ? (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStartGame}
                    disabled={!canStart || !isConnected}
                    className={[
                      'h-[54px] w-full rounded-[14px] border text-[16px] font-semibold tracking-[0.01em] transition-all',
                      canStart && isConnected
                        ? 'border-[#f3d27a]/55 bg-gradient-to-r from-[#c9a540] via-[#e0bf6a] to-[#f0d186] text-[#251800] shadow-[0_12px_32px_rgba(214,178,84,0.3)] hover:brightness-105'
                        : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-[var(--color-text-dim)]',
                    ].join(' ')}
                  >
                    开始游戏
                  </motion.button>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => router.push(`/game/${roomId}`)}
                    className="h-[54px] w-full rounded-[14px] border border-[#f3d27a]/50 bg-gradient-to-r from-[#c9a540] via-[#e0bf6a] to-[#f0d186] text-[16px] font-semibold tracking-[0.01em] text-[#251800] shadow-[0_12px_32px_rgba(214,178,84,0.3)]"
                  >
                    进入游戏 →
                  </motion.button>
                )}

                {!roomState?.isPlaying && !canSelfStart && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => router.push(`/game/${roomId}`)}
                    className="h-[42px] w-full rounded-[12px] border border-white/12 bg-white/[0.04] text-[13px] font-semibold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-gold)]/34 hover:text-[var(--color-text-primary)]"
                  >
                    进入牌桌观战
                  </motion.button>
                )}

                {!roomState?.isPlaying && (
                  <p className="text-[13px] leading-[1.6] text-[var(--color-text-muted)]">
                    {isTableFinished
                      ? '本场已结束，当前房间不再继续自动开局'
                      : !canSelfStart
                        ? '你已淘汰，可进入牌桌观战或返回大厅重新建局。'
                      : !hasEnoughPlayers
                      ? '至少需要 2 名玩家（可添加机器人）'
                      : !allHumansReady
                        ? '等待所有真人玩家点击“我已准备”'
                        : '全部就绪，可直接开始游戏'}
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">房间编号</p>
              <p className="mt-1.5 font-mono text-[13px] text-[var(--color-text-secondary)]">{roomId}</p>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="text-center">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</div>
      <div
        className="mt-2 font-display text-[32px] leading-none"
        style={{ color: color ?? 'var(--color-text-primary)' }}
      >
        {value}
      </div>
    </div>
  );
}
