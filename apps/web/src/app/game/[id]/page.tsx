'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, getPositionName } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import {
  useGameStore,
  selectHand,
  selectHandResult,
  selectValidActions,
    selectCanStartNextHand,
    selectChampionInfo,
    selectIsBotsOnlyContinuation,
    selectIsTableFinished,
    selectWinnerIds,
  } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { PokerTable } from '@/components/game/table/PokerTable';
import { ActionPanel } from '@/components/game/actions/ActionPanel';
import { ActionHistory, EliminatedChoicePanel, TableFinishedPanel, TrainingHUD, WinnerAnnouncement } from '@/components/game/hud';
import type { ActionType } from '@aipoker/shared';

interface GamePageProps {
  params: Promise<{ id: string }>;
}

function ConnectionBanner({ status }: { status: string }) {
  if (status === 'connected') return null;

  const config = {
    connecting: {
      text: '正在连接服务器',
      tone: 'border-[var(--color-warning)]/35 bg-[rgba(255,152,0,0.18)] text-[#ffc778]',
    },
    disconnected: {
      text: '连接已断开',
      tone: 'border-[var(--color-error)]/40 bg-[rgba(239,83,80,0.2)] text-[#ffb7b5]',
    },
    reconnecting: {
      text: '正在重新连接',
      tone: 'border-[var(--color-warning)]/35 bg-[rgba(255,152,0,0.18)] text-[#ffc778]',
    },
  }[status];

  if (!config) return null;

  return (
    <motion.div
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -12, opacity: 0 }}
      className={cn(
        'fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full border px-4 py-1.5 text-center text-[12px] font-semibold tracking-[0.04em] backdrop-blur-lg',
        config.tone,
      )}
    >
      {config.text}
    </motion.div>
  );
}

function GameHeader({
  roomName,
  handNumber,
  smallBlind,
  bigBlind,
  onToggleHUD,
  onBack,
}: {
  roomName?: string | undefined;
  handNumber?: number | undefined;
  smallBlind?: number | undefined;
  bigBlind?: number | undefined;
  onToggleHUD: () => void;
  onBack: () => void;
}) {
  return (
    <header className="relative z-20 border-b border-white/8 bg-[rgba(7,12,22,0.72)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={onBack}
            className="rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[12px] font-semibold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-gold)]/46 hover:text-[var(--color-text-primary)]"
          >
            返回大厅
          </button>

          <div className="rounded-xl border border-white/10 bg-[rgba(8,14,24,0.7)] px-3 py-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-base text-[var(--color-gold)]">♠</span>
                <span className="font-display text-[17px] leading-none text-[var(--color-text-primary)]">AiPoker</span>
              </div>
              {roomName && (
                <>
                  <div className="h-3.5 w-px bg-white/10" />
                  <span className="hidden max-w-[200px] truncate text-[12px] text-[var(--color-text-secondary)] sm:inline">
                    {roomName}
                  </span>
                </>
              )}
              {smallBlind !== undefined && bigBlind !== undefined && (
                <span className="rounded-md border border-white/10 bg-[rgba(0,0,0,0.32)] px-2 py-0.5 text-[11px] font-chips text-[var(--color-text-secondary)]">
                  {smallBlind}/{bigBlind}
                </span>
              )}
              {handNumber !== undefined && (
                <span className="text-[11px] text-[var(--color-text-dim)]">#{handNumber}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[rgba(7,12,22,0.62)] p-1.5 backdrop-blur-xl">
          <button
            onClick={onToggleHUD}
            className="rounded-lg bg-white/[0.04] p-1.5 text-[13px] text-[var(--color-text-muted)] transition-all hover:bg-white/[0.10] hover:text-[var(--color-text-primary)]"
            title="切换训练提示"
          >
            📊
          </button>
          <button
            className="rounded-lg bg-white/[0.04] p-1.5 text-[13px] text-[var(--color-text-muted)] transition-all hover:bg-white/[0.10] hover:text-[var(--color-text-primary)]"
            title="设置"
          >
            ⚙️
          </button>
        </div>
      </div>
    </header>
  );
}

export default function GamePage({ params }: GamePageProps) {
  const { id: roomId } = use(params);
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const currentUserId = user?.id ?? '';
  const currentUserName = user?.username ?? '';

  const { sendAction, startNextHand } = useSocket(roomId, currentUserId, currentUserName, Boolean(user));

  const hand = useGameStore(selectHand);
  const handResult = useGameStore(selectHandResult);
  const winnerIds = useGameStore(selectWinnerIds);
  const isTableFinished = useGameStore(selectIsTableFinished);
  const canStartNextHand = useGameStore(selectCanStartNextHand);
  const isBotsOnlyContinuation = useGameStore(selectIsBotsOnlyContinuation);
  const championInfo = useGameStore(selectChampionInfo);
  const validActions = useGameStore(selectValidActions);
  const timerStartedAt = useGameStore((s) => s.timerStartedAt);
  const timerDurationMs = useGameStore((s) => s.timerDurationMs);
  const isWinning = useGameStore((s) => s.isWinning);
  const winnerCards = useGameStore((s) => s.winnerCards);
  const connectionStatus = useGameStore((s) => s.connectionStatus);
  const setHandResultPhase = useGameStore((s) => s.setHandResultPhase);
  const [eliminatedDecision, setEliminatedDecision] = useState<'pending' | 'spectating' | null>(null);

  const isTrainingHUDVisible = useUIStore((s) => s.isTrainingHUDVisible);
  const toggleTrainingHUD = useUIStore((s) => s.toggleTrainingHUD);
  const isActionHistoryVisible = useUIStore((s) => s.isActionHistoryVisible);

  useEffect(() => {
    if (!user) router.replace('/');
  }, [user, router]);

  const currentPlayer = hand?.players.find((p) => p.id === currentUserId);
  const isCurrentUserActiveStackPlayer = Boolean(currentPlayer && !currentPlayer.isBot && currentPlayer.stack > 0);
  const canCurrentUserStartNextHand = canStartNextHand && isCurrentUserActiveStackPlayer;

  useEffect(() => {
    if (isTableFinished || isCurrentUserActiveStackPlayer) {
      setEliminatedDecision(null);
      return;
    }
    if (hand?.phase === 'hand_end') {
      setEliminatedDecision((current) => current ?? 'pending');
    }
  }, [hand?.handNumber, hand?.phase, isCurrentUserActiveStackPlayer, isTableFinished]);

  useEffect(() => {
    if (!hand || hand.phase !== 'hand_end' || !canCurrentUserStartNextHand) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!canCurrentUserStartNextHand) return;
      if (event.code !== 'Space') return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      event.preventDefault();
      setHandResultPhase('done');
      startNextHand('hotkey');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canCurrentUserStartNextHand, hand, setHandResultPhase, startNextHand]);

  useEffect(() => {
    if (!hand || hand.phase !== 'hand_end' || !canCurrentUserStartNextHand) return;
    if (!handResult || handResult.phase !== 'done') return;

    const timer = setTimeout(() => {
      startNextHand('auto');
    }, 1500);

    return () => clearTimeout(timer);
  }, [canCurrentUserStartNextHand, hand, handResult, startNextHand]);

  if (!user) return null;

  const currentSeat = currentPlayer?.seatIndex;
  const tableSeats = hand?.maxSeats ?? 6;

  const positionLabel =
    hand && currentSeat !== undefined
      ? getPositionName(currentSeat, hand.buttonMarkerSeat, tableSeats)
      : undefined;

  const isMyTurn = validActions !== null && currentSeat === hand?.currentActorSeat;
  const isEliminatedPendingChoice = eliminatedDecision === 'pending' && !isCurrentUserActiveStackPlayer && !isTableFinished;
  const isEliminatedSpectating = eliminatedDecision === 'spectating' && !isCurrentUserActiveStackPlayer && !isTableFinished;

  const potFromSettledPots = hand?.pots.reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const potFromCommitted = hand?.players.reduce((sum, p) => sum + p.handCommitted, 0) ?? 0;
  const pot = Math.max(potFromSettledPots, potFromCommitted);
  const championStack =
    championInfo
      ? (hand?.players.find((p) => p.id === championInfo.id)?.stack ?? null)
      : null;

  const winnerBestCardsByPlayer = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const payout of handResult?.payouts ?? []) {
      map[payout.playerId] = payout.bestCards;
    }
    return map;
  }, [handResult?.payouts]);

  const handleAction = (type: string, amount?: number) => {
    sendAction(type as ActionType, amount);
  };

  const handleStartNextHand = useCallback(() => {
    if (!canCurrentUserStartNextHand) return;
    setHandResultPhase('done');
    startNextHand('manual');
  }, [canCurrentUserStartNextHand, setHandResultPhase, startNextHand]);

  const handleDismissWinnerAnnouncement = useCallback(() => {
    if (handResult?.phase !== 'showing') return;
    setHandResultPhase('done');
  }, [handResult?.phase, setHandResultPhase]);

  const handlePlayAgain = useCallback(() => {
    const newRoomId = `room-${Math.random().toString(36).slice(2, 10)}`;
    router.push(`/room/${newRoomId}`);
  }, [router]);

  const handleBackToLobby = useCallback(() => {
    router.push('/');
  }, [router]);

  const trainingData =
    isMyTurn && validActions
      ? {
          ...(positionLabel ? { position: positionLabel } : {}),
          ...(validActions.canCheck
            ? { suggestion: 'check' as const }
            : validActions.canCall
              ? { suggestion: 'call' as const }
              : {}),
        }
      : undefined;

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
        onBack={() => router.push('/')}
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
                  winnerCards={winnerCards}
                  winnerIds={winnerIds}
                  winnerBestCardsByPlayer={winnerBestCardsByPlayer}
                  handResultPhase={handResult?.phase}
                  isWinning={isWinning}
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

          <aside className="hidden min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-[rgba(7,12,21,0.65)] p-3 backdrop-blur-xl lg:block">
            <div className="space-y-3">
              {isTrainingHUDVisible && (
                <TrainingHUD
                  isVisible={isTrainingHUDVisible}
                  onToggle={toggleTrainingHUD}
                  {...(validActions?.callAmount !== undefined ? { callAmount: validActions.callAmount } : {})}
                  potTotal={pot}
                  {...(trainingData ? { data: trainingData } : {})}
                  className="w-full"
                />
              )}

              {isActionHistoryVisible && hand && hand.actions.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-white/10 bg-[rgba(7,12,22,0.76)]">
                  <ActionHistory actions={hand.actions} />
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      <footer className="relative z-30 h-[122px] border-t border-white/8 bg-[rgba(7,12,22,0.78)] px-3 py-2.5 backdrop-blur-xl sm:h-[132px] sm:px-5 sm:py-3">
        <div className="mx-auto flex h-full w-full max-w-[980px] items-center">
          <AnimatePresence mode="wait">
            {isMyTurn && validActions ? (
              <motion.div
                key="actions"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="w-full"
              >
                <ActionPanel
                  validActions={validActions}
                  pot={pot}
                  isMyTurn={isMyTurn}
                  onAction={handleAction}
                  className="w-full"
                />
              </motion.div>
            ) : isEliminatedPendingChoice ? (
              <motion.div
                key="eliminated-choice"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="w-full"
              >
                <EliminatedChoicePanel
                  mode="decision"
                  isBotsOnlyContinuation={isBotsOnlyContinuation}
                  onSpectate={() => setEliminatedDecision('spectating')}
                  onBackToLobby={handleBackToLobby}
                />
              </motion.div>
            ) : hand?.phase === 'hand_end' && canCurrentUserStartNextHand ? (
              <motion.div
                key="next-hand"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="flex w-full flex-col items-center justify-center gap-2"
              >
                <button
                  type="button"
                  onClick={handleStartNextHand}
                  className="rounded-xl border border-[var(--color-gold)]/40 bg-gradient-to-r from-[#c6a33d] via-[#dfbe65] to-[#efcf7e] px-5 py-2 text-[14px] font-semibold text-[#241600] shadow-[0_10px_26px_rgba(214,178,84,0.28)] transition-all hover:brightness-105"
                >
                  发下一手牌（Space）
                </button>
                <p className="text-[11px] text-[var(--color-text-dim)]">若未手动开始，系统会自动推进下一手</p>
              </motion.div>
            ) : isEliminatedSpectating ? (
              <motion.div
                key="eliminated-spectating"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="w-full"
              >
                <EliminatedChoicePanel
                  mode="spectating"
                  isBotsOnlyContinuation={isBotsOnlyContinuation}
                  onBackToLobby={handleBackToLobby}
                />
              </motion.div>
            ) : hand?.phase === 'hand_end' && isTableFinished ? (
              <motion.div
                key="table-finished"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="w-full"
              >
                <TableFinishedPanel
                  championName={championInfo?.name ?? null}
                  championStack={championStack}
                  handNumber={hand?.handNumber ?? null}
                  onPlayAgain={handlePlayAgain}
                  onBackToLobby={handleBackToLobby}
                />
              </motion.div>
            ) : hand ? (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex w-full justify-center"
              >
                <div className="rounded-full border border-white/10 bg-[rgba(7,13,22,0.76)] px-4 py-1.5 text-[11px] text-[var(--color-text-dim)] sm:text-[12px]">
                  等待当前玩家行动
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </footer>

      <AnimatePresence>
        {handResult && handResult.phase !== 'done' && (
          <WinnerAnnouncement
            result={handResult}
            onDismiss={handleDismissWinnerAnnouncement}
            onPlayAgain={handlePlayAgain}
            onBackToLobby={handleBackToLobby}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
