'use client';

import { useState, type CSSProperties } from 'react';
import type { BotPersonality } from '@aipoker/shared';
import type { RoomPlayer } from '../lib/room-socket-state';
import { RoomSeatCard, type MenuAlign, type MenuSide } from './RoomSeatCard';

interface SeatSlot {
  /** [mobile, desktop] left/top, % of the stage. */
  left: [number, number];
  top: [number, number];
  menuSide: MenuSide;
  menuAlign: MenuAlign;
}

/** 6 seats around the oval, clockwise from the left; positions are % of the stage. */
const SEAT_SLOTS: SeatSlot[] = [
  { left: [11, 9], top: [50, 50], menuSide: 'below', menuAlign: 'left' },
  { left: [33, 28], top: [13, 13], menuSide: 'below', menuAlign: 'center' },
  { left: [67, 72], top: [13, 13], menuSide: 'below', menuAlign: 'center' },
  { left: [89, 91], top: [50, 50], menuSide: 'below', menuAlign: 'right' },
  { left: [67, 72], top: [87, 87], menuSide: 'above', menuAlign: 'center' },
  { left: [33, 28], top: [87, 87], menuSide: 'above', menuAlign: 'center' },
];

interface RoomTableProps {
  players: RoomPlayer[];
  currentUserId: string;
  isPlaying: boolean;
  onAddBot: (strategy: BotPersonality, seatIndex: number) => void;
  onRemoveBot: (playerId: string) => void;
}

export function RoomTable({ players, currentUserId, isPlaying, onAddBot, onRemoveBot }: RoomTableProps) {
  const [openSeat, setOpenSeat] = useState<number | null>(null);
  const playerBySeat = new Map(players.map((player) => [player.seatIndex, player]));

  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-[860px] sm:aspect-[16/10]">
      <div
        aria-hidden="true"
        className="absolute inset-[6%_4%] rounded-[50%] border-[10px] border-rail bg-felt sm:border-[14px]"
      />
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-[clamp(18px,4vw,34px)] font-bold tracking-tight text-white/15"
      >
        AiPoker
      </span>
      {SEAT_SLOTS.map((slot, seatIndex) => (
        <div
          key={seatIndex}
          className={`absolute ${openSeat === seatIndex ? 'z-30' : ''} left-[var(--x-m)] top-[var(--y-m)] -translate-x-1/2 -translate-y-1/2 sm:left-[var(--x-d)] sm:top-[var(--y-d)]`}
          style={
            {
              '--x-m': `${slot.left[0]}%`,
              '--x-d': `${slot.left[1]}%`,
              '--y-m': `${slot.top[0]}%`,
              '--y-d': `${slot.top[1]}%`,
            } as CSSProperties
          }
        >
          <RoomSeatCard
            seatIndex={seatIndex}
            player={playerBySeat.get(seatIndex) ?? null}
            currentUserId={currentUserId}
            isPlaying={isPlaying}
            menuSide={slot.menuSide}
            menuAlign={slot.menuAlign}
            menuOpen={openSeat === seatIndex}
            onMenuOpenChange={(open) => setOpenSeat(open ? seatIndex : null)}
            onAddBot={onAddBot}
            onRemoveBot={onRemoveBot}
          />
        </div>
      ))}
    </div>
  );
}
