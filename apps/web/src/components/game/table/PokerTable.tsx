'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn, calcSeatPositions } from '@/lib/utils';
import {
  getSeatDealOrderIndex,
  shouldAnimatePotAward,
  shouldRevealShowdownCards,
} from '@/features/game/lib/table-animation';
import { Seat } from './Seat';
import { FoldMuckAnimationLayer, type FoldMuckEvent } from './FoldMuckAnimationLayer';
import { CommunityCards } from '../cards/CommunityCards';
import { PotDisplay } from '../chips/PotDisplay';
import { PotToWinnerAnimation } from '../chips/PotToWinnerAnimation';
import type { HandState } from '@aipoker/shared';

interface PokerTableProps {
  hand: HandState;
  currentUserId: string;
  timerStartedAt?: number | undefined;
  timerDurationMs?: number | undefined;
  winnerCards?: string[] | undefined;
  winnerIds?: string[] | undefined;
  winnerBestCardsByPlayer?: Record<string, string[]> | undefined;
  payoutAmountsByPlayer?: Record<string, number> | undefined;
  handResultPhase?: 'announcing' | 'revealing' | 'showing' | 'done' | undefined;
  isWinning?: boolean | undefined;
  className?: string | undefined;
}

/** 桌面尺寸配置 */
const TABLE = {
  viewBox: '0 0 900 520',
  cx: 450, cy: 260,         // 中心
  rx: 360, ry: 200,         // 桌布椭圆半径
  seatRx: 400, seatRy: 192, // 座位椭圆半径（缩进以防 seat card 溢出容器）
  railWidth: 20,
} as const;

/** 游戏桌最大座位数（固定布局依据，不随当前玩家数变化） */
const MAX_SEATS = 9;

export const PokerTable = memo(function PokerTable({
  hand,
  currentUserId,
  timerStartedAt,
  timerDurationMs = 30000,
  winnerCards = [],
  winnerIds = [],
  winnerBestCardsByPlayer = {},
  payoutAmountsByPlayer = {},
  handResultPhase,
  isWinning = false,
  className,
}: PokerTableProps) {
  const [foldMuckEvents, setFoldMuckEvents] = useState<FoldMuckEvent[]>([]);
  const lastHandKeyRef = useRef('');
  const lastActionCountRef = useRef(0);

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

  const winnerIdSet = useMemo(() => new Set(winnerIds), [winnerIds]);
  const occupiedSeatIndices = useMemo(
    () => hand.players.map((player) => player.seatIndex),
    [hand.players],
  );
  const activePlayerCount = occupiedSeatIndices.length;

  const winnerTargets = useMemo(() => {
    if (winnerIds.length === 0) return [];

    return winnerIds
      .map((winnerId) => {
        const winner = hand.players.find((p) => p.id === winnerId);
        if (!winner) return null;
        const pos = seatPositions[winner.seatIndex];
        if (!pos) return null;

        return {
          playerId: winnerId,
          xPct: ((TABLE.cx + pos.x) / 900) * 100,
          yPct: ((TABLE.cy + pos.y) / 520) * 100,
        };
      })
      .filter((target): target is { playerId: string; xPct: number; yPct: number } => target !== null);
  }, [winnerIds, hand.players, seatPositions]);

  const potAnimationKey = `${hand.id}-${hand.handNumber}-${handResultPhase ?? 'idle'}-${winnerIds.join(',')}`;

  useEffect(() => {
    const handKey = `${hand.id}-${hand.handNumber}`;
    if (lastHandKeyRef.current !== handKey) {
      lastHandKeyRef.current = handKey;
      lastActionCountRef.current = 0;
      setFoldMuckEvents([]);
    }
  }, [hand.id, hand.handNumber]);

  useEffect(() => {
    if (hand.actions.length < lastActionCountRef.current) {
      lastActionCountRef.current = 0;
    }

    const newActions = hand.actions.slice(lastActionCountRef.current);
    if (newActions.length === 0) return;

    const nextEvents: FoldMuckEvent[] = [];
    for (const action of newActions) {
      if (action.type !== 'fold') continue;
      const foldedPlayer = hand.players.find((p) => p.id === action.playerId);
      if (!foldedPlayer) continue;

      const pos = seatPositions[foldedPlayer.seatIndex];
      if (!pos) continue;

      const canReveal = foldedPlayer.id === currentUserId;
      const visibleCards = canReveal ? foldedPlayer.holeCards.slice(0, 2) : [];

      nextEvents.push({
        id: `${hand.handNumber}-${action.sequenceNum}-${foldedPlayer.id}`,
        xPct: ((TABLE.cx + pos.x) / 900) * 100,
        yPct: ((TABLE.cy + pos.y) / 520) * 100,
        cards: visibleCards,
        faceDown: !canReveal || visibleCards.length < 2,
      });
    }

    if (nextEvents.length > 0) {
      setFoldMuckEvents((current) => [...current, ...nextEvents]);
    }

    lastActionCountRef.current = hand.actions.length;
  }, [hand.actions, hand.players, hand.handNumber, currentUserId, seatPositions]);

  return (
    <div
      className={cn(
        'relative mx-auto aspect-[900/520] max-h-full w-full max-w-[1180px] px-1 py-2',
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
            <stop offset="0%" stopColor="#1E5C33" />
            <stop offset="60%" stopColor="#164426" />
            <stop offset="100%" stopColor="#0E2D19" />
          </radialGradient>

          {/* 木质边框渐变 */}
          <linearGradient id="rail-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6B4423" />
            <stop offset="40%" stopColor="#5C3D1E" />
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

      <PotToWinnerAnimation
        targets={winnerTargets}
        active={shouldAnimatePotAward(handResultPhase) && winnerTargets.length > 0}
        triggerKey={potAnimationKey}
      />

      <FoldMuckAnimationLayer
        events={foldMuckEvents}
        onDone={(id) => setFoldMuckEvents((current) => current.filter((event) => event.id !== id))}
      />

      {/* ── 座位（绝对定位，围绕椭圆分布，固定 maxSeats 个槽位） ── */}
      {Array.from({ length: maxSeats }, (_, seatIndex) => {
        const pos = seatPositions[seatIndex];
        if (!pos) return null;

        // 将椭圆坐标（以中心为原点）转换为相对于容器的百分比
        const xPct = ((TABLE.cx + pos.x) / 900) * 100;
        const yPct = ((TABLE.cy + pos.y) / 520) * 100;

        const player = playerBySeat.get(seatIndex) ?? null;
        const isCurrentUser = player?.id === currentUserId;
        const isCurrentActor = hand.currentActorSeat === seatIndex;
        const isButton = hand.buttonMarkerSeat === seatIndex;
        const isSB = hand.sbSeat === seatIndex;
        const isBB = hand.bbSeat === seatIndex;
        const isWinner = Boolean(player && winnerIdSet.has(player.id));

        // 发牌延迟：给每一圈一个更明显的节拍，让桌速更像常规线上扑克客户端
        const dealOrderIndex = getSeatDealOrderIndex(
          occupiedSeatIndices,
          hand.buttonMarkerSeat ?? null,
          seatIndex,
        );
        const dealDelayBase = dealOrderIndex * 0.14;
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
              isWinner={isWinner}
              winnerBestCards={player ? winnerBestCardsByPlayer[player.id] : undefined}
              isButton={isButton}
              isSB={isSB}
              isBB={isBB}
              handResultPhase={handResultPhase}
              payoutAmount={player ? payoutAmountsByPlayer[player.id] : undefined}
              activePlayerCount={activePlayerCount}
              showHoleCards={hand.phase === 'hand_end' && shouldRevealShowdownCards(handResultPhase)}
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
