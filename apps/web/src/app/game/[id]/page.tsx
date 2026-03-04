'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, getPositionName } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore, selectHand, selectValidActions } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { PokerTable } from '@/components/game/table/PokerTable';
import { ActionPanel } from '@/components/game/actions/ActionPanel';
import { ActionHistory } from '@/components/game/hud/ActionHistory';
import { TrainingHUD } from '@/components/game/hud/TrainingHUD';
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
        'fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border px-4 py-1.5 text-center text-[12px] font-semibold tracking-[0.04em] backdrop-blur-lg',
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
}: {
  roomName?: string | undefined;
  handNumber?: number | undefined;
  smallBlind?: number | undefined;
  bigBlind?: number | undefined;
  onToggleHUD: () => void;
}) {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3">
        <div className="rounded-xl border border-white/10 bg-[rgba(7,12,22,0.62)] px-3 py-2 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-base text-[var(--color-gold)]">♠</span>
              <span className="font-display text-[17px] leading-none text-[var(--color-text-primary)]">AiPoker</span>
            </div>
            {roomName && (
              <>
                <div className="h-3.5 w-px bg-white/10" />
                <span className="hidden text-[12px] text-[var(--color-text-secondary)] sm:inline">{roomName}</span>
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

  const { sendAction } = useSocket(roomId, currentUserId, currentUserName, Boolean(user));

  const hand = useGameStore(selectHand);
  const validActions = useGameStore(selectValidActions);
  const timerStartedAt = useGameStore((s) => s.timerStartedAt);
  const timerDurationMs = useGameStore((s) => s.timerDurationMs);
  const isWinning = useGameStore((s) => s.isWinning);
  const winnerCards = useGameStore((s) => s.winnerCards);
  const connectionStatus = useGameStore((s) => s.connectionStatus);

  const isTrainingHUDVisible = useUIStore((s) => s.isTrainingHUDVisible);
  const toggleTrainingHUD = useUIStore((s) => s.toggleTrainingHUD);
  const isActionHistoryVisible = useUIStore((s) => s.isActionHistoryVisible);

  useEffect(() => {
    if (!user) router.replace('/');
  }, [user, router]);

  if (!user) return null;

  const currentPlayer = hand?.players.find((p) => p.id === currentUserId);
  const currentSeat = currentPlayer?.seatIndex;
  const tableSeats = hand?.maxSeats ?? 6;

  const positionLabel =
    hand && currentSeat !== undefined
      ? getPositionName(currentSeat, hand.buttonMarkerSeat, tableSeats)
      : undefined;

  const isMyTurn = validActions !== null && currentSeat === hand?.currentActorSeat;

  const potFromSettledPots = hand?.pots.reduce((s, p) => s + p.amount, 0) ?? 0;
  const potFromCommitted = hand?.players.reduce((s, p) => s + p.handCommitted, 0) ?? 0;
  const pot = Math.max(potFromSettledPots, potFromCommitted);

  const handleAction = (type: string, amount?: number) => {
    sendAction(type as ActionType, amount);
  };

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
    <div className="relative h-dvh w-full overflow-hidden bg-[var(--color-bg-deep)]">
      <AnimatePresence>
        <ConnectionBanner status={connectionStatus} />
      </AnimatePresence>

      <GameHeader
        roomName={`训练室 #${roomId.slice(0, 6)}`}
        handNumber={hand?.handNumber}
        smallBlind={hand?.smallBlind}
        bigBlind={hand?.bigBlind}
        onToggleHUD={toggleTrainingHUD}
      />

      <section className="relative flex h-full w-full items-center justify-center px-4 pb-24 pt-14 sm:px-6 sm:pb-26 sm:pt-16">
        {hand ? (
          <PokerTable
            hand={hand}
            currentUserId={currentUserId}
            {...(validActions ? { validActions } : {})}
            {...(timerStartedAt !== null ? { timerStartedAt } : {})}
            {...(timerDurationMs !== null ? { timerDurationMs } : {})}
            winnerCards={winnerCards}
            isWinning={isWinning}
            className="h-full w-auto max-h-full max-w-full"
          />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="h-36 w-72 rounded-full shimmer opacity-25" />
            <span className="text-[16px] text-[var(--color-text-secondary)]">等待游戏开始...</span>
          </div>
        )}
      </section>

      <AnimatePresence>
        {isTrainingHUDVisible && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="pointer-events-none fixed right-3 top-14 z-30 w-[260px] sm:right-6 sm:top-16"
          >
            <div className="pointer-events-auto">
              <TrainingHUD
                isVisible={isTrainingHUDVisible}
                onToggle={toggleTrainingHUD}
                {...(validActions?.callAmount !== undefined ? { callAmount: validActions.callAmount } : {})}
                potTotal={pot}
                {...(trainingData ? { data: trainingData } : {})}
                className="w-full"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isActionHistoryVisible && hand && hand.actions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            className="fixed bottom-[90px] left-4 z-30 max-w-[360px] overflow-hidden rounded-xl border border-white/10 bg-[rgba(7,12,22,0.76)] backdrop-blur-xl sm:left-6"
          >
            <ActionHistory actions={hand.actions} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto max-w-[880px] px-3 pb-3 sm:px-5 sm:pb-4">
          <AnimatePresence mode="wait">
            {isMyTurn && validActions ? (
              <motion.div key="actions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="pointer-events-auto">
                <ActionPanel
                  validActions={validActions}
                  pot={pot}
                  isMyTurn={isMyTurn}
                  onAction={handleAction}
                  className="w-full"
                />
              </motion.div>
            ) : hand ? (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-auto flex justify-center"
              >
                <div className="rounded-full border border-white/10 bg-[rgba(7,13,22,0.76)] px-4 py-1.5 text-[11px] text-[var(--color-text-dim)] backdrop-blur-lg sm:text-[12px]">
                  等待当前玩家行动
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
