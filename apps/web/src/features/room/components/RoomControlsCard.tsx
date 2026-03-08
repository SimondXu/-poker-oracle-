'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface RoomControlsCardProps {
  roomId: string;
  isPlaying: boolean;
  isConnected: boolean;
  isReady: boolean;
  isOwner: boolean;
  canSelfStart: boolean;
  canStart: boolean;
  hasEnoughPlayers: boolean;
  allHumansReady: boolean;
  isTableFinished: boolean;
  onMarkReady: () => void;
  onStartGame: () => void;
  onEnterGame: () => void;
}

export function RoomControlsCard({
  roomId,
  isPlaying,
  isConnected,
  isReady,
  isOwner,
  canSelfStart,
  canStart,
  hasEnoughPlayers,
  allHumansReady,
  isTableFinished,
  onMarkReady,
  onStartGame,
  onEnterGame,
}: RoomControlsCardProps) {
  const statusMessage = isTableFinished
    ? '本场已结束，当前房间不再继续自动开局'
    : !isOwner
      ? '只有房主可以开始游戏；房主开局后，你会自动进入牌桌。'
      : !hasEnoughPlayers
        ? '至少需要 2 名玩家（可添加机器人）'
        : !allHumansReady
          ? '等待所有真人玩家点击“我已准备”'
          : !canSelfStart
            ? '你已淘汰，但作为房主仍可在其他真人准备后继续发起下一手。'
          : '全部就绪，可直接开始游戏';

  return (
    <>
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

          {!isPlaying && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={onMarkReady}
              disabled={isReady || !isConnected || !canSelfStart}
              className={cn(
                'h-[50px] w-full rounded-[14px] border text-[15px] font-semibold transition-all',
                isReady
                  ? 'cursor-default border-[var(--color-success)]/45 bg-[var(--color-success-dim)] text-[var(--color-success)]'
                  : 'border-[var(--color-success)]/30 bg-[rgba(76,175,80,0.1)] text-[var(--color-success)] hover:border-[var(--color-success)]/45 hover:bg-[rgba(76,175,80,0.16)]',
                (!isConnected || !canSelfStart) && 'cursor-not-allowed opacity-50',
              )}
            >
              {canSelfStart ? (isReady ? '✓ 已准备' : '我已准备') : '已淘汰'}
            </motion.button>
          )}

          {!isPlaying ? (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={onStartGame}
              disabled={!canStart || !isConnected}
              className={cn(
                'h-[54px] w-full rounded-[14px] border text-[16px] font-semibold tracking-[0.01em] transition-all',
                canStart && isConnected
                  ? 'border-[#f3d27a]/55 bg-gradient-to-r from-[#c9a540] via-[#e0bf6a] to-[#f0d186] text-[#251800] shadow-[0_12px_32px_rgba(214,178,84,0.3)] hover:brightness-105'
                  : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-[var(--color-text-dim)]',
              )}
            >
              开始游戏
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={onEnterGame}
              className="h-[54px] w-full rounded-[14px] border border-[#f3d27a]/50 bg-gradient-to-r from-[#c9a540] via-[#e0bf6a] to-[#f0d186] text-[16px] font-semibold tracking-[0.01em] text-[#251800] shadow-[0_12px_32px_rgba(214,178,84,0.3)]"
            >
              进入游戏 →
            </motion.button>
          )}

          {!isPlaying && !canSelfStart && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={onEnterGame}
              className="h-[42px] w-full rounded-[12px] border border-white/12 bg-white/[0.04] text-[13px] font-semibold text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-gold)]/34 hover:text-[var(--color-text-primary)]"
            >
              进入牌桌观战
            </motion.button>
          )}

          {!isPlaying && (
            <p className="text-[13px] leading-[1.6] text-[var(--color-text-muted)]">{statusMessage}</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">房间编号</p>
        <p className="mt-1.5 font-mono text-[13px] text-[var(--color-text-secondary)]">{roomId}</p>
      </section>
    </>
  );
}
