import type { ActionType, HandState } from '@aipoker/shared';
import { buildCommunityRevealSteps } from './table-animation.ts';
import type { SoundName } from './sound.ts';

/** The hero's timer warning sounds this long before the deadline. */
export const TIMER_WARNING_MS = 5000;

/** No sound for a fold. */
export function soundForAction(type: ActionType): SoundName | null {
  switch (type) {
    case 'check':
      return 'check';
    case 'call':
    case 'bet':
      return 'bet';
    case 'raise_to':
      return 'raise';
    case 'all_in':
      return 'all-in';
    default:
      return null;
  }
}

/** A board card count that opens a street: first flop card, turn, river. */
function isStreetStart(cardCount: number): boolean {
  return cardCount === 1 || cardCount === 4 || cardCount === 5;
}

/** What the table shows right now (the store, after the hold queue has let things through). */
export interface TableSoundSnapshot {
  hand: HandState | null;
  /** The hero has a decision open. */
  hasValidActions: boolean;
  timerStartedAt: number | null;
  timerDurationMs: number;
  /** Phase of the shown hand result; `'showing'` is when the winner is named and the pot goes out. */
  resultPhase: 'announcing' | 'revealing' | 'showing' | 'done' | null;
}

export interface SoundScheduler {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
  now: () => number;
}

const browserScheduler: SoundScheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

const handKey = (hand: HandState) => `${hand.id}:${hand.handNumber}`;

/**
 * Turns successive table snapshots into sounds. The snapshots come from the store, which only
 * changes when the table shows something (the hold queue has already paced it), so a sound lands
 * with its picture; board cards after the first of a runout wait for the same beats the board
 * stagger uses. A hand first seen midway is a baseline: what is already on the table is not
 * replayed after a reload or a reconnect.
 */
export function createTableSoundTracker(play: (name: SoundName) => void, scheduler: SoundScheduler = browserScheduler) {
  let currentHand: string | null = null;
  let actionCount = 0;
  let boardCount = 0;
  let dealtHand: string | null = null;
  let wonHand: string | null = null;
  let turnKey: string | null = null;
  let warnedKey: string | null = null;
  let warning: { handle: unknown; deadline: number } | null = null;
  let boardTimers: unknown[] = [];

  const cancelWarning = () => {
    if (warning) scheduler.clear(warning.handle);
    warning = null;
  };
  const cancelBoard = () => {
    for (const handle of boardTimers) scheduler.clear(handle);
    boardTimers = [];
  };

  const scheduleWarning = (key: string, snapshot: TableSoundSnapshot) => {
    if (warnedKey === key || snapshot.timerStartedAt === null) return;
    const deadline = snapshot.timerStartedAt + snapshot.timerDurationMs;
    if (warning?.deadline === deadline) return;
    cancelWarning();
    const delay = deadline - TIMER_WARNING_MS - scheduler.now();
    if (delay <= 0) return;
    warning = {
      deadline,
      handle: scheduler.set(() => {
        warning = null;
        warnedKey = key;
        play('timer-warning');
      }, delay),
    };
  };

  return {
    update(snapshot: TableSoundSnapshot) {
      const { hand } = snapshot;
      if (!hand) {
        cancelBoard();
        cancelWarning();
        currentHand = dealtHand = wonHand = turnKey = warnedKey = null;
        actionCount = boardCount = 0;
        return;
      }

      const key = handKey(hand);
      if (key !== currentHand) {
        cancelBoard();
        currentHand = key;
        actionCount = hand.actions.length;
        // A hand seen from its start announces its whole board; one seen midway does not.
        boardCount = hand.actions.length === 0 ? 0 : hand.communityCards.length;
        if (hand.actions.length === 0 && hand.phase === 'betting_preflop' && dealtHand !== key) {
          dealtHand = key;
          play('deal');
        }
      }

      // Several new actions at once means missed updates; the last one is what the table shows.
      if (hand.actions.length > actionCount) {
        const last = hand.actions.at(-1);
        const sound = last ? soundForAction(last.type) : null;
        if (sound) play(sound);
      }
      actionCount = hand.actions.length;

      if (hand.communityCards.length > boardCount) {
        for (const step of buildCommunityRevealSteps(boardCount, hand.communityCards.length)) {
          if (!isStreetStart(step.count)) continue;
          if (step.delayMs <= 0) play('board');
          else boardTimers.push(scheduler.set(() => play('board'), step.delayMs));
        }
      }
      boardCount = hand.communityCards.length;

      if (snapshot.resultPhase === 'showing' && wonHand !== key) {
        wonHand = key;
        play('win');
      }

      if (snapshot.hasValidActions) {
        // One decision per hand and action count; a reconnect that replays it stays quiet.
        const decision = `${key}:${hand.actions.length}`;
        if (decision !== turnKey) {
          turnKey = decision;
          play('turn');
        }
        scheduleWarning(decision, snapshot);
      } else {
        cancelWarning();
      }
    },
    dispose() {
      cancelBoard();
      cancelWarning();
    },
  };
}
