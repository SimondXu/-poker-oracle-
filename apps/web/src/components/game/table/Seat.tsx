'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatChips } from '@/lib/utils';
import { PlayingCard } from '../cards/PlayingCard';
import { TimerBar } from '../hud/TimerBar';
import type { Phase, PlayerState } from '@aipoker/shared';

interface SeatProps {
  player: PlayerState | null;        // null = 空座位
  seatIndex: number;
  handNumber?: number | undefined;
  phase: Phase;
  isCurrentUser: boolean;
  isCurrentActor: boolean;           // 当前需要行动的玩家
  isButton: boolean;                 // 庄家位
  isSB: boolean;
  isBB: boolean;
  seatCount?: number | undefined;
  showHoleCards: boolean;            // 回放/摊牌时展示手牌
  dealDelayBase?: number | undefined; // 发牌延迟基准（秒），按座位错开
  dealFromX?: number | undefined;
  dealFromY?: number | undefined;
  timerDurationMs?: number | undefined;
  timerStartedAt?: number | undefined;
  className?: string | undefined;
}

/** Bot 思考动画 */
function ThinkingDots() {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1 h-1 rounded-full bg-[var(--color-text-secondary)]"
          animate={{ scale: [0.6, 1, 0.6], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/** 位置徽章 */
function PositionBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-[var(--color-gold)]/28 bg-[var(--color-gold)]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-gold)]">
      {label}
    </span>
  );
}

export const Seat = memo(function Seat({
  player,
  seatIndex: _seatIndex,
  handNumber,
  phase,
  isCurrentUser,
  isCurrentActor,
  isButton,
  isSB,
  isBB,
  seatCount = 6,
  showHoleCards,
  dealDelayBase = 0,
  dealFromX = -120,
  dealFromY = -90,
  timerDurationMs = 30000,
  timerStartedAt,
  className,
}: SeatProps) {
  const isEmpty = !player;
  const isFolded = player?.status === 'folded';
  const isAllIn = player?.status === 'all_in';
  const isOut = player?.status === 'out';
  const isHoleDealPhase = phase === 'betting_preflop';
  const secondPassDelay = Math.max(0.52, seatCount * 0.085 + 0.08);

  const posLabel = isButton ? 'BTN' : isSB ? 'SB' : isBB ? 'BB' : null;

  /* ── 空座位 ── */
  if (isEmpty) {
    return (
      <div
        className={cn(
          'flex items-center justify-center',
          'w-[128px] rounded-[14px]',
          'border border-dashed border-white/14 bg-white/[0.02]',
          'px-3 py-2.5',
          className,
        )}
      >
        <span className="select-none text-[12px] text-[var(--color-text-dim)]">空位</span>
      </div>
    );
  }

  /* ── 玩家座位 ── */
  return (
    <motion.div
      className={cn(
        'relative flex flex-col gap-2 rounded-[14px] px-3.5 py-3',
        'border transition-all duration-300',
        // 基础玻璃样式
        'bg-[rgba(11,19,31,0.86)] backdrop-blur-md',
        // 边框状态
        isCurrentActor
          ? 'border-[var(--color-gold)]/60'
          : isCurrentUser
            ? 'border-white/18'
            : 'border-white/10',
        // 弃牌暗化
        (isFolded || isOut) && 'opacity-50 grayscale-[50%]',
        // 宽度
        isCurrentUser ? 'min-w-[182px]' : 'min-w-[136px]',
        className,
      )}
      animate={
        isCurrentActor
          ? { boxShadow: '0 0 0 2px rgba(255,215,0,0.6), 0 0 20px rgba(255,215,0,0.25)' }
          : isAllIn
            ? { boxShadow: '0 0 12px rgba(76,175,80,0.4)' }
            : { boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }
      }
      transition={{ duration: 0.3 }}
    >
      {/* 当前行动者脉冲环 */}
      <AnimatePresence>
        {isCurrentActor && (
          <motion.div
            className="absolute inset-0 rounded-xl border-2 border-[var(--color-gold)]"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0.8, 0, 0.8], scale: [1, 1.04, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>

      {/* Top 行：头像 + 名字 + 位置 */}
      <div className="flex items-center gap-2.5">
        {/* 头像 */}
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold',
            player.isBot
              ? 'bg-[#1C2333] text-[var(--color-text-secondary)] border border-white/12'
              : 'bg-gradient-to-br from-[var(--color-gold-muted)] to-[var(--color-gold)] text-[#0D1117]',
          )}
        >
          {player.isBot ? '🤖' : player.name.charAt(0).toUpperCase()}
        </div>

        {/* 名字 + 状态 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'truncate text-[13px] font-semibold leading-none',
                isCurrentUser ? 'text-[var(--color-text-primary)]' : 'text-[#c9d4e1]',
              )}
            >
              {player.name}
            </span>
            {posLabel && <PositionBadge label={posLabel} />}
          </div>

          {/* 状态标签 */}
          {isAllIn && (
            <span className="text-[11px] font-bold leading-none text-[var(--color-success)]">ALL IN</span>
          )}
          {isFolded && (
            <span className="text-[11px] leading-none text-[var(--color-text-dim)]">弃牌</span>
          )}
          {player.isBot && isCurrentActor && !isFolded && !isAllIn && (
            <div className="mt-1">
              <ThinkingDots />
            </div>
          )}
        </div>
      </div>

      {/* 筹码量 */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-chips font-semibold text-[var(--color-gold)]">
          {formatChips(player.stack)}
        </span>
        {player.streetCommitted > 0 && (
          <span className="text-[12px] font-chips text-[var(--color-text-muted)]">
            +{formatChips(player.streetCommitted)}
          </span>
        )}
      </div>

      {/* 手牌 */}
      {(() => {
        const hasVisibleCards = player.holeCards.length > 0;
        const isActiveInHand = player.status !== 'folded' && player.status !== 'out';
        const cardSize = isCurrentUser ? 'sm' : 'xs';

        // 当前用户或摊牌：显示正面牌
        if ((isCurrentUser || showHoleCards) && hasVisibleCards) {
          return (
            <div className="mt-1 flex gap-1.5">
              {player.holeCards.map((card, i) => (
                <PlayingCard
                  key={`${handNumber ?? 'hand'}-${card}-${i}`}
                  card={card}
                  size={cardSize}
                  animateDeal={isHoleDealPhase}
                  dealDelay={isHoleDealPhase ? dealDelayBase + i * secondPassDelay : 0}
                  dealFromX={dealFromX}
                  dealFromY={dealFromY}
                  highlight={false}
                />
              ))}
            </div>
          );
        }

        // 其他活跃玩家：显示牌背（表示他们有牌但不可见）
        if (!isCurrentUser && !showHoleCards && isActiveInHand && !hasVisibleCards) {
          return (
            <div className="mt-1 flex gap-1">
              {[0, 1].map((i) => (
                <PlayingCard
                  key={`${handNumber ?? 'hand'}-back-${i}`}
                  faceDown
                  size="xs"
                  animateDeal={isHoleDealPhase}
                  dealDelay={isHoleDealPhase ? dealDelayBase + i * secondPassDelay : 0}
                  dealFromX={dealFromX}
                  dealFromY={dealFromY}
                />
              ))}
            </div>
          );
        }

        return null;
      })()}

      {/* 计时器（仅当前行动者显示） */}
      {isCurrentActor && !player.isBot && timerStartedAt && (
        <TimerBar
          durationMs={timerDurationMs}
          startedAt={timerStartedAt}
          isActive={isCurrentActor}
          className="mt-1"
        />
      )}
    </motion.div>
  );
});
