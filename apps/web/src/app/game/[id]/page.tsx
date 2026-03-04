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
    connecting:    { text: '正在连接...', color: 'bg-[var(--color-warning)]/90' },
    disconnected:  { text: '连接已断开', color: 'bg-[var(--color-error)]/90' },
    reconnecting:  { text: '正在重新连接...', color: 'bg-[var(--color-warning)]/90' },
  }[status];

  if (!config) return null;

  return (
    <motion.div
      initial={{ y: -40 }}
      animate={{ y: 0 }}
      exit={{ y: -40 }}
      className={cn(
        'fixed top-0 inset-x-0 z-50 py-2 text-center text-[13px] font-semibold text-white',
        config.color,
        'backdrop-blur-sm',
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
    <header className="flex items-center justify-between px-6 py-3 z-10 relative">
      {/* 左：品牌 + 房间信息 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-gold)] font-bold text-[16px]">♠</span>
          <span className="font-semibold text-[14px] text-[var(--color-text-primary)]">AiPoker</span>
        </div>
        {roomName && (
          <>
            <div className="w-px h-4 bg-white/10" />
            <span className="text-[12px] text-[var(--color-text-muted)]">{roomName}</span>
          </>
        )}
        {smallBlind && bigBlind && (
          <span className="text-[11px] font-chips text-[var(--color-text-dim)] bg-[var(--color-bg-surface)] px-2 py-0.5 rounded-md border border-white/6">
            {smallBlind}/{bigBlind}
          </span>
        )}
        {handNumber && (
          <span className="text-[11px] text-[var(--color-text-dim)]">#{handNumber}</span>
        )}
      </div>

      {/* 右：控制按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleHUD}
          className="p-2 rounded-lg text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-all"
          title="切换训练提示"
        >
          📊
        </button>
        <button
          className="p-2 rounded-lg text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-all"
          title="设置"
        >
          ⚙️
        </button>
        <button
          className="p-2 rounded-lg text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-dim)] transition-all"
          title="离开房间"
        >
          ✕
        </button>
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

  return (
    <div
      className="relative flex flex-col w-screen h-screen overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #0D1A0D 0%, var(--color-bg-deep) 70%)' }}
    >
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
      <main className="flex-1 flex items-center justify-center px-6 relative min-h-0">
        {hand ? (
          <PokerTable
            hand={hand}
            currentUserId={currentUserId}
            {...(validActions ? { validActions } : {})}
            {...(timerStartedAt !== null ? { timerStartedAt } : {})}
            {...(timerDurationMs !== null ? { timerDurationMs } : {})}
            winnerCards={winnerCards}
            isWinning={isWinning}
            className="max-w-[900px] w-full"
          />
        ) : (
          /* 加载骨架屏 */
          <div className="flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-64 h-32 rounded-full shimmer opacity-30" />
              <span className="text-[13px] text-[var(--color-text-dim)]">等待游戏开始...</span>
            </div>
          </div>
        )}

        {/* 训练 HUD（右侧固定） */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2">
          <TrainingHUD
            isVisible={isTrainingHUDVisible}
            onToggle={toggleTrainingHUD}
            {...(validActions?.callAmount !== undefined ? { callAmount: validActions.callAmount } : {})}
            potTotal={pot}
            {...(isMyTurn && validActions
              ? {
                  data: {
                    position: 'BTN',
                    ...(validActions.canCheck
                      ? { suggestion: 'check' as const }
                      : validActions.canCall
                        ? { suggestion: 'call' as const }
                        : {}),
                  },
                }
              : {})}
          />
        </div>
      </main>

      {/* ── 底部控制区 ── */}
      <footer className="flex flex-col gap-0 pb-4 px-6">
        {/* 行动历史条 */}
        <AnimatePresence>
          {isActionHistoryVisible && hand && hand.actions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-white/5 overflow-hidden"
            >
              <ActionHistory actions={hand.actions} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 行动面板 */}
        <div className="flex justify-center mt-2">
          <AnimatePresence>
            {isMyTurn && validActions && (
              <ActionPanel
                validActions={validActions}
                pot={pot}
                isMyTurn={isMyTurn}
                onAction={handleAction}
                className="w-full max-w-[640px]"
              />
            )}
          </AnimatePresence>
        </div>
      </footer>
    </div>
  );
}
