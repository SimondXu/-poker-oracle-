import assert from 'node:assert/strict';
import test from 'node:test';

import { createHoldQueue } from './hold-queue.ts';

function manualTimers() {
  const pending: Array<() => void> = [];
  return {
    timers: { set: (fn: () => void) => (pending.push(fn), pending.length), clear: () => pending.splice(0) },
    fire: () => pending.shift()?.(),
  };
}

test('updates apply at once when nothing is held', () => {
  const log: string[] = [];
  const queue = createHoldQueue(manualTimers().timers);
  queue.run(() => log.push('a'));
  assert.deepEqual(log, ['a']);
});

test('a hold runs its follow-up first, then what arrived meanwhile, in order', () => {
  const log: string[] = [];
  const { timers, fire } = manualTimers();
  const queue = createHoldQueue(timers);
  queue.run(() => {
    log.push('held');
    queue.hold(900, () => log.push('real'));
  });
  queue.run(() => log.push('next'));
  queue.run(() => log.push('turn'));
  assert.deepEqual(log, ['held']);
  fire();
  assert.deepEqual(log, ['held', 'real', 'next', 'turn']);
});

test('a hold started while releasing keeps the later updates behind its own follow-up', () => {
  const log: string[] = [];
  const { timers, fire } = manualTimers();
  const queue = createHoldQueue(timers);
  queue.hold(1800); // fresh deal
  queue.run(() => {
    log.push('closing-held');
    queue.hold(900, () => log.push('closing-real'));
  });
  queue.run(() => log.push('later'));
  fire();
  assert.deepEqual(log, ['closing-held']);
  fire();
  assert.deepEqual(log, ['closing-held', 'closing-real', 'later']);
});

test('clear drops what is waiting', () => {
  const log: string[] = [];
  const { timers, fire } = manualTimers();
  const queue = createHoldQueue(timers);
  queue.hold(900, () => log.push('then'));
  queue.run(() => log.push('x'));
  queue.clear();
  fire();
  queue.run(() => log.push('y'));
  assert.deepEqual(log, ['y']);
});
