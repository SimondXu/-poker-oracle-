'use client';

import { use, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { RoomControlsCard } from '@/features/room/components/RoomControlsCard';
import { RoomInviteCard } from '@/features/room/components/RoomInviteCard';
import { RoomTable } from '@/features/room/components/RoomTable';
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
  const readyHumanCount = pageState.humanPlayers.filter((player) => player.isReady).length;

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
    <div className="min-h-screen bg-page">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/')}
              aria-label="返回大厅"
              className="flex h-9 items-center gap-1.5 rounded-panel border border-line bg-panel-2 pl-2 pr-3 text-[13px] font-medium text-text hover:bg-line"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M14.5 6.5L9 12L14.5 17.5"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              返回大厅
            </button>
            <span className="text-[16px] font-bold tracking-tight text-text">AiPoker</span>
            <span className="hidden font-mono text-[13px] tracking-[0.1em] text-text-3 sm:inline">
              {roomId.slice(0, 14)}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={cn('h-2 w-2 rounded-full', isConnected ? 'bg-accent' : 'bg-fold')}
            />
            <span className="text-[13px] text-text-2" role="status">
              {isConnected ? '已连接' : '连接中…'}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] px-4 py-5 sm:px-6 sm:py-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <section aria-label="牌桌预览" className="rounded-panel border border-line bg-panel p-3 sm:p-5">
            <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h1 className="text-[16px] font-semibold text-text">等待室</h1>
              {!roomState?.isPlaying && <span className="text-[12px] text-text-3">点击空位添加机器人</span>}
            </div>
            <RoomTable
              players={roomState?.players ?? []}
              currentUserId={playerId}
              isPlaying={roomState?.isPlaying ?? false}
              onAddBot={addBot}
              onRemoveBot={removeBot}
            />
          </section>

          <aside className="rounded-panel border border-line bg-panel lg:sticky lg:top-5">
            <RoomInviteCard roomId={roomId} />
            <RoomStatusCard
              playerCount={roomState?.playerCount ?? 0}
              maxSeats={MAX_SEATS}
              readyCount={readyHumanCount}
              activeStackPlayerCount={pageState.activeStackPlayerCount}
              isPlaying={roomState?.isPlaying ?? false}
            />
            <RoomControlsCard
              isPlaying={roomState?.isPlaying ?? false}
              isConnected={isConnected}
              isReady={isReady}
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
        </div>
      </main>
    </div>
  );
}
