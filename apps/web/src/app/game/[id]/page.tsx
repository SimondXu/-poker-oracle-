'use client';

import { use } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
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

/** 连接状态提示条 */
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

/** 顶部状态栏 */
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
    <header className="relative z-10 border-b border-white/6 bg-[var(--color-bg-deep)]/72 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        {/* 左：品牌 + 房间信息 */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg text-[var(--color-gold)]">♠</span>
            <span className="font-display text-[20px] leading-none text-[var(--color-text-primary)]">AiPoker</span>
          </div>
          {roomName && (
            <>
              <div className="h-4 w-px bg-white/10" />
              <span className="hidden text-[13px] text-[var(--color-text-secondary)] sm:inline">{roomName}</span>
            </>
          )}
          {smallBlind && bigBlind && (
            <span className="rounded-md border border-white/10 bg-[var(--color-bg-surface)] px-2.5 py-1 text-[12px] font-chips text-[var(--color-text-secondary)]">
              {smallBlind}/{bigBlind}
            </span>
          )}
          {handNumber && (
            <span className="text-[12px] text-[var(--color-text-dim)]">#{handNumber}</span>
          )}
        </div>

        {/* 右：控制按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleHUD}
            className="rounded-lg border border-white/10 bg-white/[0.02] p-2 text-[14px] text-[var(--color-text-muted)] transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-[var(--color-text-primary)]"
            title="切换训练提示"
          >
            📊
          </button>
          <button
            className="rounded-lg border border-white/10 bg-white/[0.02] p-2 text-[14px] text-[var(--color-text-muted)] transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-[var(--color-text-primary)]"
            title="设置"
          >
            ⚙️
          </button>
          <button
            className="rounded-lg border border-white/10 bg-white/[0.02] p-2 text-[14px] text-[var(--color-text-muted)] transition-all hover:border-[var(--color-error)]/30 hover:bg-[var(--color-error-dim)] hover:text-[var(--color-error)]"
            title="离开房间"
          >
            ✕
          </button>
        </div>
      </div>
    </header>
  );
}

export default function GamePage({ params }: GamePageProps) {
  const { id: roomId } = use(params);

  const { sendAction } = useSocket(roomId);

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

  const currentUserId = useAuthStore((s) => s.user?.id) ?? '';

  const isMyTurn =
    validActions !== null &&
    hand?.players.find((p) => p.id === currentUserId)?.seatIndex === hand?.currentActorSeat;

  const pot = hand?.pots.reduce((s, p) => s + p.amount, 0) ?? 0;

  const handleAction = (type: string, amount?: number) => {
    sendAction(type as ActionType, amount);
  };

  const trainingData =
    isMyTurn && validActions
      ? {
          position: 'BTN',
          ...(validActions.canCheck
            ? { suggestion: 'check' as const }
            : validActions.canCall
              ? { suggestion: 'call' as const }
              : {}),
        }
      : undefined;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden">
      {/* 连接状态条 */}
      <AnimatePresence>
        <ConnectionBanner status={connectionStatus} />
      </AnimatePresence>

      {/* 顶部栏 */}
      <GameHeader
        roomName={`训练室 #${roomId.slice(0, 6)}`}
        handNumber={hand?.handNumber}
        {...(hand ? { smallBlind: hand.smallBlind, bigBlind: hand.bigBlind } : {})}
        onToggleHUD={toggleTrainingHUD}
      />

      {/* ── 主游戏区域 ── */}
      <main className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
        <div className="grid min-h-0 w-full gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-5">
          <section className="relative flex min-h-0 items-center justify-center rounded-[24px] border border-white/10 bg-[rgba(5,12,22,0.45)] px-3 py-4 sm:px-5">
            {hand ? (
              <PokerTable
                hand={hand}
                currentUserId={currentUserId}
                {...(validActions ? { validActions } : {})}
                {...(timerStartedAt !== null ? { timerStartedAt } : {})}
                {...(timerDurationMs !== null ? { timerDurationMs } : {})}
                winnerCards={winnerCards}
                isWinning={isWinning}
                className="w-full max-w-[980px]"
              />
            ) : (
              /* 加载骨架屏 */
              <div className="flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-36 w-72 rounded-full shimmer opacity-25" />
                  <span className="text-[16px] text-[var(--color-text-secondary)]">等待游戏开始...</span>
                </div>
              </div>
            )}
          </section>

          {/* 桌面端：右侧训练 HUD */}
          <aside className="hidden items-center justify-end lg:flex">
            <TrainingHUD
              isVisible={isTrainingHUDVisible}
              onToggle={toggleTrainingHUD}
              {...(validActions?.callAmount !== undefined ? { callAmount: validActions.callAmount } : {})}
              potTotal={pot}
              {...(trainingData ? { data: trainingData } : {})}
              className="w-full max-w-[280px]"
            />
          </aside>
        </div>
      </main>

      {/* ── 底部控制区 ── */}
      <footer className="mx-auto w-full max-w-[1400px] px-4 pb-4 sm:px-6 sm:pb-5">
        {/* 移动端：训练 HUD */}
        <div className="mb-2 lg:hidden">
          <TrainingHUD
            isVisible={isTrainingHUDVisible}
            onToggle={toggleTrainingHUD}
            {...(validActions?.callAmount !== undefined ? { callAmount: validActions.callAmount } : {})}
            potTotal={pot}
            {...(trainingData ? { data: trainingData } : {})}
            className="w-full max-w-none"
          />
        </div>

        {/* 行动历史条 */}
        <AnimatePresence>
          {isActionHistoryVisible && hand && hand.actions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden rounded-t-xl border border-b-0 border-white/8 bg-[rgba(8,14,24,0.76)]"
            >
              <ActionHistory actions={hand.actions} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 行动面板 */}
        <div className="mt-2 flex justify-center">
          <AnimatePresence>
            {isMyTurn && validActions && (
              <ActionPanel
                validActions={validActions}
                pot={pot}
                isMyTurn={isMyTurn}
                onAction={handleAction}
                className="w-full max-w-[780px]"
              />
            )}
          </AnimatePresence>
        </div>

        {!isMyTurn && (
          <p className="mt-2 text-center text-[12px] text-[var(--color-text-dim)]">
            等待当前玩家行动
          </p>
        )}
      </footer>
    </div>
  );
}
