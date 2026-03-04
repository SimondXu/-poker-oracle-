'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn, calcSeatPositions } from '@/lib/utils';
import { Seat } from './Seat';
import { CommunityCards } from '../cards/CommunityCards';
import { PotDisplay } from '../chips/PotDisplay';
import type { HandState, ValidActions } from '@aipoker/shared';

interface PokerTableProps {
  hand: HandState;
  currentUserId: string;
  validActions?: ValidActions | undefined;
  timerStartedAt?: number | undefined;
  timerDurationMs?: number | undefined;
  winnerCards?: string[] | undefined;
  isWinning?: boolean | undefined;
  className?: string | undefined;
}

/** 桌面尺寸配置 */
const TABLE = {
  viewBox: '0 0 900 520',
  cx: 450, cy: 260,        // 中心
  rx: 360, ry: 200,        // 桌布椭圆半径
  seatRx: 420, seatRy: 214, // 座位椭圆半径（稍大，在桌边外）
  railWidth: 20,
} as const;

/** 游戏桌最大座位数（固定布局依据，不随当前玩家数变化） */
const MAX_SEATS = 9;

export const PokerTable = memo(function PokerTable({
  hand,
  currentUserId,
  validActions,
  timerStartedAt,
  timerDurationMs = 30000,
  winnerCards = [],
  isWinning = false,
  className,
}: PokerTableProps) {
  // 座位总数以实际房间配置为准；默认 6 人桌（最大不超过 MAX_SEATS）
  const maxSeats = Math.min(hand.maxSeats ?? 6, MAX_SEATS);

  // 找到当前用户的 seatIndex，用于旋转座位使其出现在底部
  const currentUserSeat = useMemo(
    () => hand.players.find((p) => p.id === currentUserId)?.seatIndex ?? null,
    [hand.players, currentUserId],
  );

  // 固定 maxSeats 个座位位置，椭圆均匀分布
  // 旋转偏移：让当前用户的座位落在底部（angle = π/2）
  const seatPositions = useMemo(() => {
    const offsetAngle =
      currentUserSeat !== null
        ? Math.PI / 2 - (2 * Math.PI * currentUserSeat) / maxSeats
        : -Math.PI / 2; // 无当前用户时默认 seat 0 在顶部
    return calcSeatPositions(maxSeats, TABLE.seatRx, TABLE.seatRy, offsetAngle);
  }, [maxSeats, currentUserSeat]);

  // 将 hand.players 按 seatIndex 建立查找表，方便 O(1) 取玩家
  const playerBySeat = useMemo(() => {
    const map = new Map(hand.players.map((p) => [p.seatIndex, p]));
    return map;
  }, [hand.players]);

  return (
    <div
      className={cn(
        'relative mx-auto aspect-[900/520] w-full max-w-[1180px] max-h-full',
        className,
      )}
    >
      {/* ── SVG 桌面背景 ── */}
      <svg
        viewBox={TABLE.viewBox}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          {/* 桌布渐变 */}
          <radialGradient id="felt-gradient" cx="50%" cy="50%" r="60%">
            <stop offset="0%"   stopColor="#1E5C33" />
            <stop offset="60%"  stopColor="#164426" />
            <stop offset="100%" stopColor="#0E2D19" />
          </radialGradient>

          {/* 木质边框渐变 */}
          <linearGradient id="rail-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#6B4423" />
            <stop offset="40%"  stopColor="#5C3D1E" />
            <stop offset="100%" stopColor="#2C1C0A" />
          </linearGradient>

          {/* 桌面内阴影 */}
          <filter id="felt-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="18" />
            <feOffset dx="0" dy="6" result="shadow" />
            <feComposite in="shadow" in2="SourceGraphic" operator="out" result="inner" />
            <feColorMatrix in="inner" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* 整体阴影 */}
          <filter id="table-drop-shadow">
            <feDropShadow dx="0" dy="12" stdDeviation="24" floodColor="rgba(0,0,0,0.7)" floodOpacity="1" />
          </filter>
        </defs>

        {/* 外层木质边框 */}
        <ellipse
          cx={TABLE.cx}
          cy={TABLE.cy}
          rx={TABLE.rx + TABLE.railWidth + 4}
          ry={TABLE.ry + TABLE.railWidth + 4}
          fill="url(#rail-gradient)"
          filter="url(#table-drop-shadow)"
        />

        {/* 木质边框高光 */}
        <ellipse
          cx={TABLE.cx}
          cy={TABLE.cy}
          rx={TABLE.rx + TABLE.railWidth}
          ry={TABLE.ry + TABLE.railWidth}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />

        {/* 桌面底层（深色内边框） */}
        <ellipse
          cx={TABLE.cx}
          cy={TABLE.cy}
          rx={TABLE.rx + 3}
          ry={TABLE.ry + 3}
          fill="rgba(0,0,0,0.6)"
        />

        {/* 桌布主体 */}
        <ellipse
          cx={TABLE.cx}
          cy={TABLE.cy}
          rx={TABLE.rx}
          ry={TABLE.ry}
          fill="url(#felt-gradient)"
          filter="url(#felt-shadow)"
        />

        {/* 桌面内边线 */}
        <ellipse
          cx={TABLE.cx}
          cy={TABLE.cy}
          rx={TABLE.rx - 16}
          ry={TABLE.ry - 16}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
        />

        {/* 桌面细节：中心暗纹 */}
        <ellipse
          cx={TABLE.cx}
          cy={TABLE.cy}
          rx={TABLE.rx / 2}
          ry={TABLE.ry / 2}
          fill="rgba(0,0,0,0.08)"
        />
      </svg>

      {/* ── React 覆盖层：公共牌 + 底池 ── */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <CommunityCards
            cards={hand.communityCards}
            winnerCards={winnerCards}
          />
          <PotDisplay
            pots={hand.pots}
            isWinning={isWinning}
          />
        </div>
      </div>

      {/* ── 座位（绝对定位，围绕椭圆分布，固定 maxSeats 个槽位） ── */}
      {Array.from({ length: maxSeats }, (_, seatIndex) => {
        const pos = seatPositions[seatIndex];
        if (!pos) return null;

        // 将椭圆坐标（以中心为原点）转换为相对于容器的百分比
        // SVG 中 cx=450, cy=260, 整体 900x520
        const xPct = ((TABLE.cx + pos.x) / 900) * 100;
        const yPct = ((TABLE.cy + pos.y) / 520) * 100;

        const player = playerBySeat.get(seatIndex) ?? null;
        const isCurrentUser = player?.id === currentUserId;
        const isCurrentActor = hand.currentActorSeat === seatIndex;
        const isButton = hand.buttonMarkerSeat === seatIndex;
        const isSB = hand.sbSeat === seatIndex;
        const isBB = hand.bbSeat === seatIndex;
        // 发牌延迟：按座位索引错开，模拟第一轮逐位发牌
        const dealDelayBase = seatIndex * 0.09;
        // 以桌面中心作为发牌来源，让发牌路径更自然
        const dealFromX = -pos.x * 0.62;
        const dealFromY = -pos.y * 0.62;

        return (
          <motion.div
            key={seatIndex}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${xPct}%`,
              top: isCurrentUser ? `calc(${yPct}% - 34px)` : `${yPct}%`,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: seatIndex * 0.05, type: 'spring', stiffness: 300, damping: 24 }}
          >
            <Seat
              player={player}
              seatIndex={seatIndex}
              handNumber={hand.handNumber}
              phase={hand.phase}
              isCurrentUser={isCurrentUser}
              isCurrentActor={isCurrentActor}
              isButton={isButton}
              isSB={isSB}
              isBB={isBB}
              seatCount={maxSeats}
              showHoleCards={hand.phase === 'showdown' || hand.phase === 'hand_end'}
              dealDelayBase={dealDelayBase}
              dealFromX={dealFromX}
              dealFromY={dealFromY}
              timerDurationMs={timerDurationMs}
              {...(isCurrentActor && timerStartedAt !== undefined ? { timerStartedAt } : {})}
            />
          </motion.div>
        );
      })}
    </div>
  );
});
