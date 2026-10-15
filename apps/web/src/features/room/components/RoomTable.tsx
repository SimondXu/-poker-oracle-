'use client';

import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { BOT_PROFILES, CLI_BOT_PROFILES, type BotChoice } from '../lib/bot-profiles';
import { ROOM_MAX_SEATS } from '../lib/practice-plan';
import type { RoomPlayer } from '../lib/room-socket-state';
import { SEAT_SLOTS, slotToSeat } from '../lib/seat-slots';
import { BotMenu } from './BotMenu';
import { RoomSeatCard } from './RoomSeatCard';

interface RoomTableProps {
  players: RoomPlayer[];
  currentUserId: string;
  isPlaying: boolean;
  /** Claude Code bots are offered next to the rule bots. */
  cliBots: boolean;
  onAddBot: (choice: BotChoice, seatIndex: number) => void;
  canRemoveBots: boolean;
  onRemoveBot: (playerId: string) => void;
}

interface OpenMenu {
  seatIndex: number;
  anchor: HTMLElement;
}

/** Mini felt table: six seats around the rail, the player at the bottom, seat count in the middle. */
export function RoomTable({ players, currentUserId, isPlaying, cliBots, onAddBot, canRemoveBots, onRemoveBot }: RoomTableProps) {
  const t = useT();
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const playerBySeat = new Map(players.map((player) => [player.seatIndex, player]));
  const anchorSeat = players.find((player) => player.id === currentUserId)?.seatIndex ?? 0;

  const anchorRef = useRef<HTMLElement | null>(null);

  const closeMenu = useCallback(() => {
    setMenu(null);
    anchorRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      data-layout-box="room-table"
      className="relative mx-auto aspect-[4/5] w-full max-w-[900px] sm:aspect-[16/10]"
    >
      <div
        aria-hidden
        className="absolute inset-x-[2%] inset-y-[2.5%] rounded-[50%] border-[10px] border-rail bg-felt felt-guilloche shadow-[0_18px_40px_-18px_rgb(0_0_0/0.7)] sm:inset-x-[2.5%] sm:inset-y-[5%] sm:border-[14px]"
      />
      <div
        aria-hidden
        className="absolute inset-x-[2%] inset-y-[2.5%] rounded-[50%] shadow-[inset_0_0_0_1px_rgb(184_154_94/0.3)] sm:inset-x-[2.5%] sm:inset-y-[5%]"
      />

      <div
        aria-live="polite"
        className="medallion-frame absolute left-1/2 top-1/2 flex w-[72px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[50%] bg-ink-2 py-3 [--medallion-ground:var(--color-ink-2)] sm:w-[148px] sm:py-4"
      >
        <span className="font-index text-title font-bold text-text sm:text-display">
          {players.length}
          <span className="text-text-3">/{ROOM_MAX_SEATS}</span>
        </span>
        <span className="label-index mt-1 text-micro text-text-3">
          {t('lobby.room.seatedLabel')}
        </span>
      </div>

      {SEAT_SLOTS.map((slot, slotIndex) => {
        const seatIndex = slotToSeat(slotIndex, anchorSeat);
        return (
          <div
            key={slotIndex}
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2',
              'left-[var(--x-tall)] top-[var(--y-tall)] sm:left-[var(--x-wide)] sm:top-[var(--y-wide)]',
            )}
            style={
              {
                '--x-tall': `${slot.tall.x}%`,
                '--y-tall': `${slot.tall.y}%`,
                '--x-wide': `${slot.wide.x}%`,
                '--y-wide': `${slot.wide.y}%`,
              } as CSSProperties
            }
          >
            <RoomSeatCard
              seatNumber={seatIndex + 1}
              player={playerBySeat.get(seatIndex) ?? null}
              currentUserId={currentUserId}
              isPlaying={isPlaying}
              menuOpen={menu?.seatIndex === seatIndex}
              onOpenMenu={(anchor) => {
                anchorRef.current = anchor;
                setMenu({ seatIndex, anchor });
              }}
              canRemoveBots={canRemoveBots}
              onRemoveBot={onRemoveBot}
            />
          </div>
        );
      })}

      {menu && (
        <BotMenu
          anchor={menu.anchor}
          seatNumber={menu.seatIndex + 1}
          onClose={closeMenu}
          profiles={cliBots ? [...BOT_PROFILES, ...CLI_BOT_PROFILES] : BOT_PROFILES}
          onPick={(choice) => {
            onAddBot(choice, menu.seatIndex);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}
