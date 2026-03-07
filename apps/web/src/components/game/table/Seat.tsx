'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { getPlayerAvatarMeta } from '@/lib/player-avatar';
import { cn, formatChips } from '@/lib/utils';
import {
  getDisplayedSeatStack,
  getHoleCardSecondPassDelay,
  shouldDimLosingSeat,
  type ResultAnimationPhase,
} from '@/features/game/lib/table-animation';
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
  isWinner?: boolean | undefined;
  winnerBestCards?: string[] | undefined;
  isButton: boolean;                 // 庄家位
  isSB: boolean;
  isBB: boolean;
  handResultPhase?: ResultAnimationPhase;
  payoutAmount?: number | undefined;
  activePlayerCount?: number | undefined;
  showHoleCards: boolean;            // 回放/摊牌时展示手牌
  dealDelayBase?: number | undefined; // 发牌延迟基准（秒），按座位错开
  dealFromX?: number | undefined;
  dealFromY?: number | undefined;
  timerDurationMs?: number | undefined;
  timerStartedAt?: number | undefined;
  className?: string | undefined;
}

/** 位置徽章 */
function PositionBadge({ label }: { label: string }) {
  return (
    <span className="rounded-[4px] border border-[var(--color-gold)]/28 bg-[var(--color-gold)]/10 px-1 py-px text-[9px] font-bold uppercase leading-none tracking-[0.1em] text-[var(--color-gold)]">
      {label}
    </span>
  );
}

/** 状态标签 */
function StatusTag({ status, isWinner }: { status: string; isWinner: boolean }) {
  if (isWinner) {
    return (
      <span className="rounded-[4px] bg-[var(--color-gold)]/15 px-1 py-px text-[9px] font-bold leading-none text-[var(--color-gold)]">
        赢家
      </span>
    );
  }
  if (status === 'all_in') {
    return (
      <span className="rounded-[4px] bg-[var(--color-success)]/15 px-1 py-px text-[9px] font-bold leading-none text-[var(--color-success)]">
        ALL IN
      </span>
    );
  }
  if (status === 'folded') {
    return (
      <span className="rounded-[4px] bg-white/5 px-1 py-px text-[9px] leading-none text-[var(--color-text-dim)]">
        弃牌
      </span>
    );
  }
  return null;
}

export const Seat = memo(function Seat({
  player,
  seatIndex: _seatIndex,
  handNumber,
  phase,
  isCurrentUser,
  isCurrentActor,
  isWinner = false,
  winnerBestCards = [],
  isButton,
  isSB,
  isBB,
  handResultPhase,
  payoutAmount,
  activePlayerCount = 2,
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
  const secondPassDelay = getHoleCardSecondPassDelay(activePlayerCount);
  const winnerCardSet = useMemo(() => new Set(winnerBestCards), [winnerBestCards]);
  const displayedStack = getDisplayedSeatStack(player?.stack ?? 0, payoutAmount, handResultPhase);
  const shouldDimForResult = shouldDimLosingSeat({
    phase,
    resultPhase: handResultPhase,
    isWinner,
    status: player?.status ?? 'out',
  });

  const posLabel = isButton ? 'BTN' : isSB ? 'SB' : isBB ? 'BB' : null;
  /* ── 空座位 ── */
  if (isEmpty) {
    return (
      <div
        className={cn(
          'flex h-[42px] w-[120px] items-center justify-center',
          'rounded-xl border border-dashed border-white/12 bg-white/[0.02]',
          className,
        )}
      >
        <span className="select-none text-[11px] text-[var(--color-text-dim)]">空位</span>
      </div>
    );
  }

  const avatarMeta = getPlayerAvatarMeta({
    name: player.name,
    isBot: player.isBot,
    botStrategy: player.botStrategy,
    isHeroPlayer: isCurrentUser,
  });

  /* ── 手牌渲染 ── */
  const renderCards = (() => {
    const hasKnownCards = player.holeCards.length > 0;
    const isActiveInHand = player.status !== 'folded' && player.status !== 'out';
    const cardSize = isCurrentUser ? 'sm' : 'xs';
    const shouldShowFaceDownCards = !isCurrentUser && isActiveInHand && !showHoleCards;
    const cardSlots = Array.from({ length: 2 }, (_, i) => player.holeCards[i]);

    if ((isCurrentUser && hasKnownCards) || shouldShowFaceDownCards || (showHoleCards && hasKnownCards)) {
      return (
        <div className="flex gap-1">
          {cardSlots.map((card, i) => (
            <PlayingCard
              key={`${handNumber ?? 'hand'}-${player.id}-${i}`}
              {...(card ? { card } : {})}
              size={cardSize}
              faceDown={Boolean(!isCurrentUser && (!showHoleCards || !card))}
              animateDeal={isHoleDealPhase}
              dealDelay={isHoleDealPhase ? dealDelayBase + i * secondPassDelay : 0}
              dealFromX={dealFromX}
              dealFromY={dealFromY}
              highlight={Boolean(card && isWinner && winnerCardSet.has(card))}
            />
          ))}
        </div>
      );
    }

    return null;
  })();

  /* ── 玩家座位 ── */
  return (
    <motion.div
      className={cn(
        'relative rounded-xl border transition-all duration-300',
        // 固定宽度保持一致性
        isCurrentUser ? 'w-[172px]' : 'w-[142px]',
        // 边框状态
        isWinner
          ? 'border-[var(--color-gold)]/65'
          : isCurrentActor
          ? 'border-[var(--color-gold)]/45'
          : isCurrentUser
            ? 'border-white/14'
            : 'border-white/8',
        // 弃牌/淘汰暗化
        (isFolded || isOut) && 'opacity-50 grayscale-[50%]',
        shouldDimForResult && 'opacity-45 saturate-50',
        className,
      )}
      animate={
        isWinner
          ? {
              y: handResultPhase === 'showing' ? [0, -4, 0] : 0,
              scale: handResultPhase === 'showing' ? [1, 1.02, 1] : 1,
              boxShadow: '0 0 0 1px rgba(255,215,0,0.18), 0 0 26px rgba(255,215,0,0.22)',
            }
          : isCurrentActor
          ? { boxShadow: '0 0 0 2px rgba(255,215,0,0.22), 0 0 18px rgba(255,215,0,0.12)' }
          : isAllIn
            ? { boxShadow: '0 0 0 1px rgba(76,175,80,0.18), 0 0 18px rgba(76,175,80,0.10)' }
            : shouldDimForResult
              ? { scale: 0.985, boxShadow: 'none' }
              : { boxShadow: 'none', scale: 1, y: 0 }
      }
      transition={{ duration: 0.45 }}
    >
      <div className="seat-surface overflow-hidden rounded-xl">
        {/* 内容区 */}
        <div className="px-3 py-2.5">
          {/* Row 1: 头像 + 名字 + 位置 + 状态 */}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border text-[11px] font-semibold shadow-[0_8px_18px_rgba(0,0,0,0.24)]',
                player.isBot
                  ? 'border-white/10 bg-[#101927] text-[var(--color-text-secondary)]'
                  : isCurrentUser
                    ? 'border-[var(--color-gold)]/35 bg-[radial-gradient(circle_at_top,rgba(255,215,0,0.18),rgba(13,17,23,0.98))] text-[var(--color-gold)]'
                    : 'border-white/10 bg-[rgba(255,255,255,0.04)] text-[#D7E0EA]',
              )}
            >
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_62%)]" />
              {avatarMeta.src ? (
                <img src={avatarMeta.src} alt={avatarMeta.alt ?? ''} className="relative h-full w-full object-cover" />
              ) : (
                <span className="relative">{avatarMeta.fallbackLabel}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    'truncate text-[12px] font-semibold leading-none',
                    isCurrentUser ? 'text-[var(--color-text-primary)]' : 'text-[#c9d4e1]',
                  )}
                >
                  {player.name}
                </span>
                {posLabel && <PositionBadge label={posLabel} />}
              </div>
              <div className="mt-1 flex items-center gap-1">
                <StatusTag status={player.status} isWinner={isWinner} />
                {player.isBot && isCurrentActor && !isFolded && !isAllIn && (
                  <div className="flex items-center gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="h-1 w-1 rounded-full bg-[var(--color-text-secondary)]"
                        animate={{ scale: [0.6, 1, 0.6], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: 筹码 */}
          <div className="mt-1.5 flex items-center justify-between">
            <span className="font-chips text-[12px] font-semibold text-[var(--color-gold)]">
              {formatChips(displayedStack)}
            </span>
            {player.streetCommitted > 0 && (
              <span className="font-chips text-[11px] text-[var(--color-text-muted)]">
                +{formatChips(player.streetCommitted)}
              </span>
            )}
          </div>

          {/* Row 3: 手牌 */}
          {renderCards && <div className="mt-1.5">{renderCards}</div>}
        </div>

        {/* Footer: 计时器（仅当前行动者的真人玩家） */}
        {isCurrentActor && !player.isBot && timerStartedAt && (
          <div className="seat-footer px-3 py-2">
            <TimerBar
              durationMs={timerDurationMs}
              startedAt={timerStartedAt}
              isActive={isCurrentActor}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
});
