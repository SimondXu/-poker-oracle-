import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActionType, GameAction, HandState, Phase } from '@aipoker/shared';

import {
  TIMER_WARNING_MS,
  createTableSoundTracker,
  soundForAction,
  type SoundScheduler,
  type TableSoundSnapshot,
} from './table-sounds.ts';
import type { SoundName } from './sound.ts';

function manualScheduler(start = 1_000_000) {
  let now = start;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const scheduler: SoundScheduler = {
    set: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (handle) => void pending.delete(handle as number),
    now: () => now,
  };
  return {
    scheduler,
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...pending]) {
        if (timer.at <= now) {
          pending.delete(id);
          timer.fn();
        }
      }
    },
    get pendingCount() {
      return pending.size;
    },
    get now() {
      return now;
    },
  };
}

const action = (type: ActionType, n: number): GameAction =>
  ({ playerId: 'p', playerName: 'P', seatIndex: 0, phase: 'betting_preflop', type, amount: 0, addedAmount: 0, toAmount: 0, stackBefore: 0, potTotalBefore: 0, sequenceNum: n, timestamp: n }) as GameAction;

function hand(overrides: { id?: string; handNumber?: number; phase?: Phase; actions?: ActionType[]; board?: number; actor?: number | null } = {}): HandState {
  return {
    id: overrides.id ?? 'h1',
    handNumber: overrides.handNumber ?? 1,
    phase: overrides.phase ?? 'betting_preflop',
    actions: (overrides.actions ?? []).map(action),
    communityCards: Array.from({ length: overrides.board ?? 0 }, (_, i) => `c${i}`),
    currentActorSeat: overrides.actor ?? null,
  } as unknown as HandState;
}

const snap = (h: HandState | null, extra: Partial<TableSoundSnapshot> = {}): TableSoundSnapshot => ({
  hand: h,
  heroSeat: 0,
  hasValidActions: false,
  timerStartedAt: null,
  timerDurationMs: 30_000,
  resultPhase: null,
  ...extra,
});

function setup() {
  const clock = manualScheduler();
  const played: SoundName[] = [];
  const tracker = createTableSoundTracker((name) => played.push(name), clock.scheduler);
  return { clock, played, tracker };
}

test('every action maps to its sound; folds are silent', () => {
  assert.equal(soundForAction('check'), 'check');
  assert.equal(soundForAction('call'), 'bet');
  assert.equal(soundForAction('bet'), 'bet');
  assert.equal(soundForAction('raise_to'), 'raise');
  assert.equal(soundForAction('all_in'), 'all-in');
  assert.equal(soundForAction('fold'), null);
});

test('a fresh hand deals once; a hand first seen midway is a silent baseline', () => {
  const { tracker, played } = setup();
  tracker.update(snap(hand()));
  tracker.update(snap(hand()));
  assert.deepEqual(played, ['deal']);

  const midway = setup();
  midway.tracker.update(snap(hand({ id: 'h9', actions: ['call', 'raise_to'], board: 3 })));
  assert.deepEqual(midway.played, []);
});

test('each new action plays its sound once, whoever acts', () => {
  const { tracker, played } = setup();
  tracker.update(snap(hand()));
  played.length = 0;

  tracker.update(snap(hand({ actions: ['call'] })));
  tracker.update(snap(hand({ actions: ['call'] })));
  tracker.update(snap(hand({ actions: ['call', 'raise_to'] })));
  tracker.update(snap(hand({ actions: ['call', 'raise_to', 'fold'] })));
  tracker.update(snap(hand({ actions: ['call', 'raise_to', 'fold', 'all_in'] })));
  assert.deepEqual(played, ['bet', 'raise', 'all-in']);
});

test('after missed updates only the last action sounds', () => {
  const { tracker, played } = setup();
  tracker.update(snap(hand({ actions: ['call'] })));
  tracker.update(snap(hand({ actions: ['call', 'check', 'check', 'raise_to'] })));
  assert.deepEqual(played, ['raise']);
});

test('the board sounds once per street, never again for the same cards', () => {
  const { tracker, played } = setup();
  tracker.update(snap(hand({ actions: ['call', 'check'] })));
  played.length = 0;

  tracker.update(snap(hand({ phase: 'betting_flop', actions: ['call', 'check'], board: 3 })));
  tracker.update(snap(hand({ phase: 'betting_flop', actions: ['call', 'check'], board: 3 })));
  assert.deepEqual(played, ['board']);

  tracker.update(snap(hand({ phase: 'betting_turn', actions: ['call', 'check'], board: 4 })));
  tracker.update(snap(hand({ phase: 'betting_turn', actions: ['call', 'check'], board: 4 })));
  tracker.update(snap(hand({ phase: 'betting_river', actions: ['call', 'check'], board: 5 })));
  assert.deepEqual(played, ['board', 'board', 'board']);
});

test('an all-in runout sounds the turn and river on the board stagger beats', () => {
  const { tracker, played, clock } = setup();
  tracker.update(snap(hand({ actions: ['all_in', 'call'], board: 0 })));
  played.length = 0;

  tracker.update(snap(hand({ phase: 'hand_end', actions: ['all_in', 'call'], board: 5 })));
  assert.deepEqual(played, ['board']);
  // Flop cards follow each other quickly (no sound of their own); turn and river get a beat each.
  clock.advance(1099);
  assert.deepEqual(played, ['board']);
  clock.advance(1);
  assert.deepEqual(played, ['board', 'board']);
  clock.advance(779);
  assert.deepEqual(played, ['board', 'board']);
  clock.advance(1);
  assert.deepEqual(played, ['board', 'board', 'board']);
});

test('a new hand cancels board sounds still waiting from the last one', () => {
  const { tracker, played, clock } = setup();
  tracker.update(snap(hand({ actions: ['all_in', 'call'], board: 3 })));
  tracker.update(snap(hand({ phase: 'hand_end', actions: ['all_in', 'call'], board: 5 })));
  played.length = 0;
  assert.equal(clock.pendingCount, 1);

  tracker.update(snap(hand({ id: 'h2', handNumber: 2 })));
  assert.equal(clock.pendingCount, 0);
  assert.deepEqual(played, ['deal']);
});

const hero = (o: Parameters<typeof hand>[0] = {}) => hand({ ...o, actor: 0 });

test('the turn sounds once per decision, not on a replay of the same state', () => {
  const { tracker, played, clock } = setup();
  const open = { hasValidActions: true, timerStartedAt: clock.now, timerDurationMs: 4_000 };
  tracker.update(snap(hand()));
  played.length = 0;

  // Hero to act right after the opponent's call: the turn waits a beat behind the chips.
  tracker.update(snap(hero({ actions: ['call'] }), open));
  assert.deepEqual(played, ['bet']);
  clock.advance(349);
  assert.deepEqual(played, ['bet']);
  clock.advance(1);
  assert.deepEqual(played, ['bet', 'turn']);

  // Reconnect: the same decision arrives again, with and without a gap in between.
  tracker.update(snap(hero({ actions: ['call'] }), open));
  tracker.update(snap(hero({ actions: ['call'] }), { ...open, timerStartedAt: clock.now + 500 }));
  tracker.update(snap(hero({ actions: ['call'] })));
  tracker.update(snap(hero({ actions: ['call'] }), open));
  clock.advance(1_000);
  assert.deepEqual(played, ['bet', 'turn']);

  // The hero acts and is asked again later in the hand.
  tracker.update(snap(hand({ actions: ['call', 'raise_to'] })));
  clock.advance(1_000);
  tracker.update(snap(hero({ actions: ['call', 'raise_to', 'call'] }), open));
  clock.advance(1_000);
  assert.deepEqual(played, ['bet', 'turn', 'raise', 'bet', 'turn']);
});

test('the turn waits for the table to show the hero to act, once, after the board', () => {
  // The hero checked the flop and timed out; opponents act, the turn card falls, then the hero is up.
  const { tracker, played, clock } = setup();
  const decision = { hasValidActions: true, timerStartedAt: clock.now, timerDurationMs: 30_000 };
  const flopActions: ActionType[] = ['call', 'check', 'check'];
  tracker.update(snap(hero({ phase: 'betting_flop', actions: flopActions, board: 3 }), decision));
  clock.advance(1_000);
  played.length = 0;

  // The hero's next decision is already in the store while the hold queue still shows the old street.
  const open = { hasValidActions: true, timerStartedAt: clock.now, timerDurationMs: 30_000 };
  tracker.update(snap(hand({ phase: 'betting_flop', actions: [...flopActions, 'check'], board: 3, actor: 1 }), open));
  clock.advance(900);
  tracker.update(snap(hand({ phase: 'betting_flop', actions: [...flopActions, 'check', 'check'], board: 3, actor: 2 }), open));
  clock.advance(900);
  assert.deepEqual(played, ['check', 'check']);

  // Street change: the turn card shows and the hero is up in the same update; the turn sound
  // follows the board by a beat, and sounds once however often the state repeats.
  const turnStreet = { phase: 'betting_turn', actions: [...flopActions, 'check', 'check'] as ActionType[], board: 4 } as const;
  tracker.update(snap(hero(turnStreet), open));
  assert.deepEqual(played, ['check', 'check', 'board']);
  tracker.update(snap(hero(turnStreet), open));
  clock.advance(350);
  clock.advance(5_000);
  assert.deepEqual(played, ['check', 'check', 'board', 'turn']);
});

test('a delayed turn is dropped if the hero acts first', () => {
  const { tracker, played, clock } = setup();
  const open = { hasValidActions: true, timerStartedAt: clock.now, timerDurationMs: 30_000 };
  tracker.update(snap(hand()));
  tracker.update(snap(hero({ actions: ['call'] }), open));
  assert.equal(clock.pendingCount, 2); // the delayed turn and the timer warning
  tracker.update(snap(hand({ actions: ['call', 'raise_to'] })));
  assert.equal(clock.pendingCount, 0);
  clock.advance(60_000);
  assert.deepEqual(played, ['deal', 'bet', 'raise']);
});

test('no turn sound while it is someone else\'s turn or the hand is over', () => {
  const { tracker, played, clock } = setup();
  const open = { hasValidActions: true, timerStartedAt: clock.now, timerDurationMs: 30_000 };
  tracker.update(snap(hand({ actor: 3 }), open));
  tracker.update(snap(hand({ phase: 'hand_end', actor: 0 }), open));
  tracker.update(snap(hand({ actor: 0 }), { ...open, heroSeat: null }));
  clock.advance(60_000);
  assert.deepEqual(played, ['deal']);
});

test('the timer warning sounds once, five seconds before the deadline', () => {
  const { tracker, played, clock } = setup();
  const open = { hasValidActions: true, timerStartedAt: clock.now, timerDurationMs: 30_000 };
  tracker.update(snap(hero(), open));
  clock.advance(1_000);
  played.length = 0;

  clock.advance(30_000 - TIMER_WARNING_MS - 1_000 - 1);
  assert.deepEqual(played, []);
  clock.advance(1);
  assert.deepEqual(played, ['timer-warning']);

  // Replays of the same decision do not warn again.
  tracker.update(snap(hero(), open));
  tracker.update(snap(hero(), { ...open, timerStartedAt: clock.now, timerDurationMs: 30_000 }));
  clock.advance(60_000);
  assert.deepEqual(played, ['timer-warning']);
});

test('a timer warning that lands on another sound waits a beat', () => {
  const { tracker, played, clock } = setup();
  const open = { hasValidActions: true, timerStartedAt: clock.now, timerDurationMs: 30_000 };
  tracker.update(snap(hero(), open));
  clock.advance(25_000 - 100);
  played.length = 0;
  // Another sound is released just before the warning is due.
  tracker.update(snap(hero(), { ...open, resultPhase: 'showing' }));
  clock.advance(100);
  assert.deepEqual(played, ['win']);
  clock.advance(349);
  assert.deepEqual(played, ['win']);
  clock.advance(1);
  assert.deepEqual(played, ['win', 'timer-warning']);
});

test('no warning when the hero acts first, or when the timer is already short', () => {
  const acted = setup();
  const open = { hasValidActions: true, timerStartedAt: acted.clock.now, timerDurationMs: 30_000 };
  acted.tracker.update(snap(hero(), open));
  acted.tracker.update(snap(hand({ actions: ['call'] })));
  assert.equal(acted.clock.pendingCount, 0);
  acted.clock.advance(60_000);
  assert.deepEqual(acted.played, ['deal', 'bet']);

  const short = setup();
  short.tracker.update(snap(hero(), { hasValidActions: true, timerStartedAt: short.clock.now, timerDurationMs: 4_000 }));
  assert.equal(short.clock.pendingCount, 1); // only the delayed turn
});

test('a replay with a shorter server timer moves the warning', () => {
  const { tracker, played, clock } = setup();
  tracker.update(snap(hero(), { hasValidActions: true, timerStartedAt: clock.now, timerDurationMs: 30_000 }));
  clock.advance(10_000);
  played.length = 0;

  tracker.update(snap(hero(), { hasValidActions: true, timerStartedAt: clock.now, timerDurationMs: 12_000 }));
  clock.advance(7_000 - 1);
  assert.deepEqual(played, []);
  clock.advance(1);
  assert.deepEqual(played, ['timer-warning']);
});

test('the win sounds once per hand, when the winner is shown', () => {
  const { tracker, played } = setup();
  const ended = hand({ phase: 'hand_end', actions: ['call', 'raise_to', 'fold'], board: 5 });
  tracker.update(snap(ended));
  played.length = 0;

  tracker.update(snap(ended, { resultPhase: 'announcing' }));
  tracker.update(snap(ended, { resultPhase: 'revealing' }));
  assert.deepEqual(played, []);
  tracker.update(snap(ended, { resultPhase: 'showing' }));
  tracker.update(snap(ended, { resultPhase: 'done' }));
  // A replayed result for the same hand goes through the phases again.
  tracker.update(snap(ended, { resultPhase: 'announcing' }));
  tracker.update(snap(ended, { resultPhase: 'showing' }));
  assert.deepEqual(played, ['win']);

  tracker.update(snap(hand({ id: 'h2', handNumber: 2, phase: 'hand_end', actions: ['fold'] }), { resultPhase: 'showing' }));
  assert.deepEqual(played.filter((name) => name === 'win').length, 2);
});

test('resetting the store clears the guards', () => {
  const { tracker, played } = setup();
  tracker.update(snap(hand()));
  tracker.update(snap(null));
  tracker.update(snap(hand()));
  assert.deepEqual(played, ['deal', 'deal']);
});
