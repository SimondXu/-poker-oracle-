'use client';

import { use, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { RoomControlsCard } from '@/features/room/components/RoomControlsCard';
import { RoomSeatCard } from '@/features/room/components/RoomSeatCard';
import { RoomStatusCard } from '@/features/room/components/RoomStatusCard';
import { useRoomSocket, type RoomJoinIntent } from '@/features/room/hooks/useRoomSocket';
import { getRoomPageState } from '@/features/room/lib/room-page-state';
import {
  getRoomAutoNavigationTarget,
  shouldNormalizeCreateIntent,
  shouldRedirectRoomJoinFailure,
} from '@/features/room/lib/room-navigation';

interface RoomPageProps {
  params: Promise<{ id: string }>;
}

const MAX_SEATS = 6;

export default function RoomPage({ params }: RoomPageProps) {
  const { id: roomId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const intentParam = searchParams.get('intent');
  const intent: RoomJoinIntent = intentParam === 'create' ? 'create' : 'join';
  const initialIntentRef = useRef<RoomJoinIntent>(intent);
  const hasNavigatedToGameRef = useRef(false);
  const initialIntent = initialIntentRef.current;

  useEffect(() => {
    if (!user) {
      router.replace('/');
    }
  }, [user, router]);

  const playerId = user?.id ?? '';
  const playerName = user?.username ?? '';

  const handleJoinFailed = useCallback(
    (error?: string) => {
      if (shouldRedirectRoomJoinFailure(error)) {
        router.replace('/');
      }
    },
    [router],
  );

  const { roomState, isConnected, isReady, addBot, removeBot, markReady, startGame } = useRoomSocket(
    roomId,
    playerId,
    playerName,
    { intent: initialIntent, onJoinFailed: handleJoinFailed },
  );

  useEffect(() => {
    if (!shouldNormalizeCreateIntent(initialIntent, roomState, playerId)) {
      return;
    }

    router.replace(`/room/${roomId}?intent=join`);
  }, [initialIntent, playerId, roomId, roomState, router]);

  const navigateToGame = useCallback(() => {
    const target = getRoomAutoNavigationTarget(roomId, true);
    if (!target || hasNavigatedToGameRef.current) {
      return;
    }

    hasNavigatedToGameRef.current = true;
    router.push(target);
  }, [roomId, router]);

  useEffect(() => {
    const target = getRoomAutoNavigationTarget(roomId, roomState?.isPlaying ?? false);
    if (!target || hasNavigatedToGameRef.current) {
      return;
    }

    hasNavigatedToGameRef.current = true;
    router.push(target);
  }, [roomId, roomState?.isPlaying, router]);

  const pageState = getRoomPageState(roomState, playerId);
  const playerBySeat = useMemo(
    () => new Map(roomState?.players.map((player) => [player.seatIndex, player]) ?? []),
    [roomState?.players],
  );

  const handleStartGame = useCallback(() => {
    startGame(navigateToGame);
  }, [navigateToGame, startGame]);

  const handleEnterGame = useCallback(() => {
    router.push(`/game/${roomId}`);
  }, [roomId, router]);

  if (!user) {
    return null;
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-12 top-10 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-12 bottom-10 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <header className="sticky top-0 z-20 border-b border-white/6 bg-[var(--color-bg-deep)]/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <motion.button
              whileHover={{ y: -1.5, scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/')}
              aria-label="返回大厅"
              className={cn(
                'group relative flex h-10 items-center gap-2.5 overflow-hidden rounded-[12px] border px-3.5 sm:h-11',
                'border-white/14 bg-[rgba(12,20,31,0.84)] text-[var(--color-text-secondary)]',
                'transition-all duration-200',
                'shadow-[var(--shadow-hairline),0_8px_18px_rgba(0,0,0,0.32)]',
                'hover:border-[var(--color-gold)]/42 hover:bg-[rgba(16,25,38,0.9)] hover:text-[var(--color-text-primary)] hover:shadow-[var(--shadow-hairline),0_12px_24px_rgba(0,0,0,0.4)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2d58a]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-deep)]',
              )}
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
              <span className="font-display text-[20px] leading-none text-[var(--color-text-primary)]">AiPoker</span>
            </div>
            <div className="h-5 w-px bg-white/10" />
            <span className="hidden font-mono text-[12px] tracking-[0.08em] text-[var(--color-text-muted)] sm:inline">
              {roomId.slice(0, 14)}
            </span>
            <span className="hidden rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)] sm:inline-flex">
              {initialIntent === 'create' ? '创建模式' : '加入模式'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'h-2.5 w-2.5 rounded-full transition-colors',
                isConnected ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]',
              )}
            />
            <span className="hidden text-[13px] text-[var(--color-text-secondary)] sm:inline">
              {isConnected ? '已连接' : '连接中…'}
            </span>
          </div>
        </div>
      </header>

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
                  {pageState.isOwner ? '点击空位添加机器人' : '等待房主配置座位'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {Array.from({ length: MAX_SEATS }, (_, seatIndex) => (
                <RoomSeatCard
                  key={seatIndex}
                  seatIndex={seatIndex}
                  player={playerBySeat.get(seatIndex) ?? null}
                  currentUserId={playerId}
                  isPlaying={roomState?.isPlaying ?? false}
                  canManageBots={pageState.isOwner}
                  onAddBot={addBot}
                  onRemoveBot={removeBot}
                />
              ))}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <RoomStatusCard
              playerCount={roomState?.playerCount ?? 0}
              readyCount={pageState.readyHumanCount}
              activeStackPlayerCount={pageState.activeStackPlayerCount}
              isPlaying={roomState?.isPlaying ?? false}
            />
            <RoomControlsCard
              roomId={roomId}
              isPlaying={roomState?.isPlaying ?? false}
              isConnected={isConnected}
              isReady={isReady}
              isOwner={pageState.isOwner}
              canSelfStart={pageState.canSelfStart}
              canStart={pageState.canStart}
              hasEnoughPlayers={pageState.hasEnoughPlayers}
              allHumansReady={pageState.allHumansReady}
              isTableFinished={pageState.isTableFinished}
              onMarkReady={markReady}
              onStartGame={handleStartGame}
              onEnterGame={handleEnterGame}
            />
          </aside>
        </section>
      </main>
    </div>
  );
}
