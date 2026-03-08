'use client';

import { use, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { WinnerAnnouncement } from '@/components/game/hud';
import { PokerTable } from '@/components/game/table/PokerTable';
import { ConnectionBanner } from '@/features/game/components/ConnectionBanner';
import { GameFooter } from '@/features/game/components/GameFooter';
import { GameHeader } from '@/features/game/components/GameHeader';
import { GameSidebar } from '@/features/game/components/GameSidebar';
import { useGameScreenState } from '@/features/game/hooks/useGameScreenState';
import { useGameSocket } from '@/features/game/hooks/useGameSocket';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

interface GamePageProps {
  params: Promise<{ id: string }>;
}

export default function GamePage({ params }: GamePageProps) {
  const { id: roomId } = use(params);
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? '';
  const currentUserName = user?.username ?? '';

  const { sendAction, startNextHand, spectateAfterElimination } = useGameSocket(
    roomId,
    currentUserId,
    currentUserName,
    Boolean(user),
  );
  const {
    hand,
    handResult,
    validActions,
    timerStartedAt,
    timerDurationMs,
    isWinning,
    winnerCards,
    winnerIds,
    connectionStatus,
    isBotsOnlyContinuation,
    championInfo,
    footerMode,
    screenState,
    handleStartNextHand,
    handleDismissWinnerAnnouncement,
    handleSpectate,
  } = useGameScreenState({
    currentUserId,
    startNextHand,
    spectateAfterElimination,
  });

  const isTrainingHUDVisible = useUIStore((state) => state.isTrainingHUDVisible);
  const toggleTrainingHUD = useUIStore((state) => state.toggleTrainingHUD);
  const isActionHistoryVisible = useUIStore((state) => state.isActionHistoryVisible);

  useEffect(() => {
    if (!user) {
      router.replace('/');
    }
  }, [router, user]);

  const handleReturnToLobby = useCallback(() => {
    router.push('/');
  }, [router]);

  if (!user) {
    return null;
  }

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-[var(--color-bg-deep)]">
      <AnimatePresence>
        <ConnectionBanner status={connectionStatus} />
      </AnimatePresence>

      <GameHeader
        roomName={`训练室 #${roomId.slice(0, 6)}`}
        handNumber={hand?.handNumber}
        smallBlind={hand?.smallBlind}
        bigBlind={hand?.bigBlind}
        onToggleHUD={toggleTrainingHUD}
        onBack={handleReturnToLobby}
      />

      <main className="min-h-0 flex-1 px-3 pb-2 pt-2 sm:px-5 sm:pb-3">
        <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="relative min-h-0 overflow-hidden rounded-2xl border border-white/8 bg-[rgba(7,12,20,0.6)] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-3">
            <div className="flex h-full min-h-0 items-center justify-center">
              {hand ? (
                <PokerTable
                  hand={hand}
                  currentUserId={currentUserId}
                  {...(timerStartedAt !== null ? { timerStartedAt } : {})}
                  {...(timerDurationMs !== null ? { timerDurationMs } : {})}
                  winnerCards={screenState.shouldHighlightWinners ? winnerCards : []}
                  winnerIds={screenState.shouldHighlightWinners ? winnerIds : []}
                  winnerBestCardsByPlayer={
                    screenState.shouldHighlightWinners ? screenState.winnerBestCardsByPlayer : {}
                  }
                  payoutAmountsByPlayer={screenState.payoutAmountsByPlayer}
                  handResultPhase={handResult?.phase}
                  isWinning={isWinning && screenState.shouldRunAwardAnimation}
                  className="h-full w-auto max-h-full max-w-full"
                />
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="h-36 w-72 rounded-full shimmer opacity-25" />
                  <span className="text-[16px] text-[var(--color-text-secondary)]">等待游戏开始...</span>
                </div>
              )}
            </div>
          </section>

          <GameSidebar
            hand={hand}
            isTrainingHUDVisible={isTrainingHUDVisible}
            isActionHistoryVisible={isActionHistoryVisible}
            onToggleTrainingHUD={toggleTrainingHUD}
            validActions={validActions}
            pot={screenState.pot}
            trainingData={screenState.trainingData}
          />
        </div>
      </main>

      <GameFooter
        mode={footerMode}
        validActions={validActions}
        pot={screenState.pot}
        isMyTurn={screenState.isMyTurn}
        isBotsOnlyContinuation={isBotsOnlyContinuation}
        championName={championInfo?.name ?? null}
        championStack={screenState.championStack}
        handNumber={hand?.handNumber ?? null}
        onAction={sendAction}
        onSpectate={handleSpectate}
        onStartNextHand={handleStartNextHand}
        onPlayAgain={handleReturnToLobby}
        onBackToLobby={handleReturnToLobby}
      />

      <AnimatePresence>
        {handResult && screenState.shouldShowResultModal && (
          <WinnerAnnouncement
            result={handResult}
            onDismiss={handleDismissWinnerAnnouncement}
            onPlayAgain={handleReturnToLobby}
            onBackToLobby={handleReturnToLobby}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
