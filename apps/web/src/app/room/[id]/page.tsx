'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LocaleToggle } from '@/components/LocaleToggle';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { PracticeProgress } from '@/features/room/components/PracticeProgress';
import { RoomControlsCard } from '@/features/room/components/RoomControlsCard';
import { RoomInviteCard } from '@/features/room/components/RoomInviteCard';
import { RoomTable } from '@/features/room/components/RoomTable';
import { Wordmark } from '@/features/room/components/Wordmark';
import { usePracticeSetup } from '@/features/room/hooks/usePracticeSetup';
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

export default function RoomPage({ params }: RoomPageProps) {
  const { id: roomId } = use(params);
  const router = useRouter();
  const t = useT();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const intentParam = searchParams.get('intent');
  const intent: RoomJoinIntent = intentParam === 'create' ? 'create' : 'join';
  const initialIntentRef = useRef<RoomJoinIntent>(intent);
  const [practiceRequested] = useState(() => searchParams.get('mode') === 'practice' && intent === 'create');
  const hasNavigatedToGameRef = useRef(false);
  const initialIntent = initialIntentRef.current;
  const [practiceAbandoned, setPracticeAbandoned] = useState(false);

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

  const {
    roomState,
    isConnected,
    isReady,
    addBot,
    removeBot,
    markReady,
    startGame,
    requestAddBot,
    requestReady,
    requestStart,
  } = useRoomSocket(roomId, playerId, playerName, { intent: initialIntent, onJoinFailed: handleJoinFailed });

  // Once, early: drop ?intent=create so a refresh joins instead of re-creating. Never after we head to the table.
  const hasNormalizedIntentRef = useRef(false);
  useEffect(() => {
    if (
      hasNormalizedIntentRef.current
      || hasNavigatedToGameRef.current
      || !shouldNormalizeCreateIntent(initialIntent, roomState, playerId)
    ) {
      return;
    }

    hasNormalizedIntentRef.current = true;
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
  const players = roomState?.players ?? [];
  const isPlaying = roomState?.isPlaying ?? false;

  const practice = usePracticeSetup({
    enabled: practiceRequested && !practiceAbandoned,
    ready: isConnected && pageState.selfPlayer !== null,
    players,
    requestAddBot,
    requestReady,
    requestStart,
    onStarted: navigateToGame,
  });
  const isPracticeActive = practiceRequested && !practiceAbandoned;

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
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => router.push('/')}
            aria-label={t('lobby.room.backAria')}
            className="-ml-2 flex size-11 touch-manipulation select-none items-center justify-center rounded-[var(--radius-control)] text-text-2 [-webkit-tap-highlight-color:transparent] transition-[color,background-color,transform] duration-[var(--duration-fast)] ease-out hover:bg-panel-2 hover:text-text active:scale-95 motion-reduce:transition-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Wordmark className="shrink-0" />
          <span
            aria-label={t('lobby.room.roomCode', { code: roomId })}
            className="font-index hidden h-7 items-center rounded-[var(--radius-stamp)] border border-brass/50 px-2 text-body font-semibold tracking-caps-wide text-brass min-[420px]:inline-flex"
          >
            {roomId.slice(0, 14)}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span role="status" className="flex items-center gap-2 text-body text-text-2">
              <span aria-hidden className={cn('size-2 rounded-full', isConnected ? 'bg-positive' : 'bg-vermilion')} />
              <span className="hidden sm:inline">
                {t(isConnected ? 'common.connection.connected' : 'common.connection.connecting')}
              </span>
            </span>
            <LocaleToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:py-8">
        <div className="mb-3 flex items-baseline justify-between gap-3 sm:mb-4">
          <h1 className="font-index text-title font-bold tracking-[0.02em] text-text">
            {t('lobby.room.title')}
          </h1>
          {!isPlaying && !isPracticeActive && (
            <span className="text-body text-text-3">{t('lobby.room.hint')}</span>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
          <section aria-label={t('lobby.room.tableLabel')}>
            <RoomTable
              players={players}
              currentUserId={playerId}
              isPlaying={isPlaying || isPracticeActive}
              onAddBot={addBot}
              onRemoveBot={removeBot}
            />
          </section>

          <aside
            data-layout-box="room-panel"
            className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-panel lg:sticky lg:top-6"
          >
            {isPracticeActive ? (
              <PracticeProgress setup={practice} isConnected={isConnected} onManual={() => setPracticeAbandoned(true)} />
            ) : (
              <>
                <RoomControlsCard
                  isPlaying={isPlaying}
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
                <RoomInviteCard roomId={roomId} />
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
