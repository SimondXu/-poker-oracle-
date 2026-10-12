'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BotPersonality } from '@aipoker/shared';
import type { MessageKey } from '@/i18n';
import { getRoomErrorKey } from '../lib/room-errors';
import { planPracticeSeating, PRACTICE_LINEUP } from '../lib/practice-plan';
import type { RoomPlayer } from '../lib/room-socket-state';
import type { RoomAck } from './useRoomSocket';

export type PracticePhase = 'idle' | 'seating' | 'readying' | 'starting' | 'done' | 'failed';

interface UsePracticeSetupInput {
  /** Practice mode requested (from the URL) and not abandoned by the user. */
  enabled: boolean;
  /** Socket connected and the player is seated in the room. */
  ready: boolean;
  players: readonly RoomPlayer[];
  requestAddBot: (strategy: BotPersonality, seatIndex: number) => Promise<RoomAck>;
  requestReady: () => Promise<RoomAck>;
  requestStart: () => Promise<RoomAck>;
  onStarted: () => void;
}

export interface PracticeSetup {
  phase: PracticePhase;
  seated: number;
  total: number;
  errorKey: MessageKey | null;
  retry: () => void;
}

const SEAT_STAGGER_MS = 140;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Practice now: once the room exists and the player is seated, seat the practice bots one by one,
 * mark the player ready and start the game. Runs once per attempt; `retry` re-plans from the room's
 * current state, so a partial failure only adds what is missing.
 */
export function usePracticeSetup({
  enabled,
  ready,
  players,
  requestAddBot,
  requestReady,
  requestStart,
  onStarted,
}: UsePracticeSetupInput): PracticeSetup {
  const [phase, setPhase] = useState<PracticePhase>('idle');
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [attempt, setAttempt] = useState(0);
  const playersRef = useRef(players);
  const startedAttemptRef = useRef<number | null>(null);
  const handlersRef = useRef({ requestAddBot, requestReady, requestStart, onStarted });

  useEffect(() => {
    playersRef.current = players;
    handlersRef.current = { requestAddBot, requestReady, requestStart, onStarted };
  });

  useEffect(() => {
    if (!enabled || !ready || startedAttemptRef.current === attempt) {
      return;
    }
    startedAttemptRef.current = attempt;

    void (async () => {
      const { requestAddBot: addBot, requestReady: markReady, requestStart: start, onStarted: done } = handlersRef.current;
      const fail = (error: string | undefined, fallback: MessageKey) => {
        setErrorKey(getRoomErrorKey(error, fallback));
        setPhase('failed');
      };

      setErrorKey(null);
      setPhase('seating');

      const current = playersRef.current;
      const steps = planPracticeSeating(
        current.map((player) => player.seatIndex),
        current.filter((player) => player.isBot).length,
      );
      for (const step of steps) {
        const res = await addBot(step.strategy, step.seatIndex);
        if (!res.ok) {
          fail(res.error, 'lobby.room.error.addBot');
          return;
        }
        await sleep(SEAT_STAGGER_MS);
      }

      setPhase('readying');
      const readyRes = await markReady();
      if (!readyRes.ok) {
        fail(readyRes.error, 'lobby.room.error.ready');
        return;
      }

      setPhase('starting');
      const startRes = await start();
      if (!startRes.ok) {
        fail(startRes.error, 'lobby.room.error.start');
        return;
      }

      setPhase('done');
      done();
    })();
  }, [attempt, enabled, ready]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return {
    phase,
    seated: players.filter((player) => player.isBot).length,
    total: PRACTICE_LINEUP.length,
    errorKey,
    retry,
  };
}
