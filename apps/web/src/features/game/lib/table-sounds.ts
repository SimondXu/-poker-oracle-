import type { ActionType, HandState } from '@aipoker/shared';
import { buildCommunityRevealSteps } from './table-animation.ts';
import type { SoundName } from './sound.ts';

/** The hero's timer warning sounds this long before the deadline. */
export const TIMER_WARNING_MS = 5000;
/** A turn or warning sound that would land within this long of another sound waits this long. */
export const SOUND_SPACING_MS = 350;

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
  /** The hero has a decision open (it may arrive before the table has shown it is their turn). */
  hasValidActions: boolean;
  /** The hero's seat in the shown hand; `null` when they are not seated (spectating). */
  heroSeat: number | null;
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
  let pendingTurn: unknown = null;
  let boardTimers: unknown[] = [];
  let lastSoundAt: number | null = null;

  const emit = (name: SoundName) => {
    lastSoundAt = scheduler.now();
    play(name);
  };
  const crowded = () => lastSoundAt !== null && scheduler.now() - lastSoundAt < SOUND_SPACING_MS;

  const cancelTurn = () => {
    if (pendingTurn !== null) scheduler.clear(pendingTurn);
    pendingTurn = null;
  };
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
    const fire = () => {
      if (crowded()) {
        warning = { deadline, handle: scheduler.set(fire, SOUND_SPACING_MS) };
        return;
      }
      warning = null;
      warnedKey = key;
      emit('timer-warning');
    };
    warning = { deadline, handle: scheduler.set(fire, delay) };
  };

  return {
    update(snapshot: TableSoundSnapshot) {
      const { hand } = snapshot;
      if (!hand) {
        cancelBoard();
        cancelTurn();
        cancelWarning();
        currentHand = dealtHand = wonHand = turnKey = warnedKey = null;
        actionCount = boardCount = 0;
        return;
      }

      const key = handKey(hand);
      if (key !== currentHand) {
        cancelBoard();
        cancelTurn();
        currentHand = key;
        actionCount = hand.actions.length;
        // A hand seen from its start announces its whole board; one seen midway does not.
        boardCount = hand.actions.length === 0 ? 0 : hand.communityCards.length;
        if (hand.actions.length === 0 && hand.phase === 'betting_preflop' && dealtHand !== key) {
          dealtHand = key;
          emit('deal');
        }
      }

      // Several new actions at once means missed updates; the last one is what the table shows.
      if (hand.actions.length > actionCount) {
        const last = hand.actions.at(-1);
        const sound = last ? soundForAction(last.type) : null;
        if (sound) emit(sound);
      }
      actionCount = hand.actions.length;

      if (hand.communityCards.length > boardCount) {
        for (const step of buildCommunityRevealSteps(boardCount, hand.communityCards.length)) {
          if (!isStreetStart(step.count)) continue;
          if (step.delayMs <= 0) emit('board');
          else boardTimers.push(scheduler.set(() => emit('board'), step.delayMs));
        }
      }
      boardCount = hand.communityCards.length;

      if (snapshot.resultPhase === 'showing' && wonHand !== key) {
        wonHand = key;
        emit('win');
      }

      // The decision can reach the store before the table has shown the hero's turn (the hold queue
      // is still releasing the actions before it and the next street); it counts once it is shown.
      const heroToAct =
        snapshot.hasValidActions &&
        snapshot.heroSeat !== null &&
        hand.phase !== 'hand_end' &&
        hand.currentActorSeat === snapshot.heroSeat;
      if (heroToAct) {
        // One decision per hand, street and action count; a reconnect that replays it stays quiet.
        const decision = `${key}:${hand.phase}:${hand.actions.length}`;
        if (decision !== turnKey) {
          cancelTurn();
          turnKey = decision;
          if (crowded()) {
            pendingTurn = scheduler.set(() => {
              pendingTurn = null;
              emit('turn');
            }, SOUND_SPACING_MS);
          } else {
            emit('turn');
          }
        }
        scheduleWarning(decision, snapshot);
      } else {
        // The hero acted, or the table moved on, before a delayed sound landed.
        cancelTurn();
        cancelWarning();
      }
    },
    dispose() {
      cancelBoard();
      cancelTurn();
      cancelWarning();
    },
  };
}
