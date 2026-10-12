import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentTurnCoordinator } from './index.ts';

test('coordinator starts an async turn job without awaiting queue progress and emits thinking first', async () => {
  const scheduledResolutions: Array<{ roomId: string; playerId: string; resolution: { type: string } }> = [];
  const statusEvents: Array<{ status: string; turnToken?: string }> = [];
  let releaseJob: (() => void) | null = null;

  const coordinator = createAgentTurnCoordinator({
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });

  const started = coordinator.startTurn({
    roomId: 'room-1',
    playerId: 'bot-1',
    timeoutMs: 1_000,
    run: async () => {
      await new Promise<void>((resolve) => {
        releaseJob = resolve;
      });
      return { type: 'completed', action: { type: 'check' as const } };
    },
    emitStatus(event) {
      statusEvents.push(event);
    },
    scheduleResolution(roomId, playerId, resolution) {
      scheduledResolutions.push({ roomId, playerId, resolution });
    },
  });

  assert.equal(started.accepted, true);
  assert.match(started.turnToken, /^turn_[0-9a-f-]{36}$/);
  assert.equal(statusEvents[0]?.status, 'thinking');
  assert.equal(scheduledResolutions.length, 0);

  releaseJob?.();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(scheduledResolutions.length, 1);
  assert.equal(scheduledResolutions[0]?.resolution.type, 'completed');
});

test('coordinator schedules timeout resolution when a turn exceeds its deadline', async () => {
  const scheduledResolutions: Array<{ type: string; error?: string }> = [];

  const coordinator = createAgentTurnCoordinator({
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });

  coordinator.startTurn({
    roomId: 'room-2',
    playerId: 'bot-2',
    timeoutMs: 10,
    run: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { type: 'completed', action: { type: 'check' as const } };
    },
    emitStatus() {},
    scheduleResolution(_roomId, _playerId, resolution) {
      scheduledResolutions.push(resolution);
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(scheduledResolutions, [{ type: 'timeout', error: 'timeout' }]);
});

test('coordinator discards stale completion results after a newer turn replaces the pending job', async () => {
  const scheduledResolutions: Array<{ roomId: string; playerId: string; resolution: { type: string } }> = [];
  let firstRelease: (() => void) | null = null;
  let secondRelease: (() => void) | null = null;

  const coordinator = createAgentTurnCoordinator({
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });

  coordinator.startTurn({
    roomId: 'room-3',
    playerId: 'bot-3',
    timeoutMs: 1_000,
    run: async () => {
      await new Promise<void>((resolve) => {
        firstRelease = resolve;
      });
      return { type: 'completed', action: { type: 'fold' as const } };
    },
    emitStatus() {},
    scheduleResolution(roomId, playerId, resolution) {
      scheduledResolutions.push({ roomId, playerId, resolution });
    },
  });

  coordinator.startTurn({
    roomId: 'room-3',
    playerId: 'bot-3',
    timeoutMs: 1_000,
    run: async () => {
      await new Promise<void>((resolve) => {
        secondRelease = resolve;
      });
      return { type: 'completed', action: { type: 'check' as const } };
    },
    emitStatus() {},
    scheduleResolution(roomId, playerId, resolution) {
      scheduledResolutions.push({ roomId, playerId, resolution });
    },
  });

  firstRelease?.();
  secondRelease?.();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(scheduledResolutions.length, 1);
  assert.equal(scheduledResolutions[0]?.resolution.type, 'completed');
});

test('coordinator cancels pending room jobs during cleanup', async () => {
  const scheduledResolutions: Array<{ type: string }> = [];

  const coordinator = createAgentTurnCoordinator({
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });

  coordinator.startTurn({
    roomId: 'room-4',
    playerId: 'bot-4',
    timeoutMs: 30,
    run: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { type: 'completed', action: { type: 'check' as const } };
    },
    emitStatus() {},
    scheduleResolution(_roomId, _playerId, resolution) {
      scheduledResolutions.push(resolution);
    },
  });

  coordinator.cancelRoom('room-4');
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.deepEqual(scheduledResolutions, []);
});

test('coordinator aborts the in-flight run when the turn times out or the room is cancelled', async () => {
  const coordinator = createAgentTurnCoordinator<{ type: 'check' }>({
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
  const signals: AbortSignal[] = [];
  const startTurn = (roomId: string, timeoutMs: number) =>
    coordinator.startTurn({
      roomId,
      playerId: 'bot-1',
      timeoutMs,
      run: async (signal) => {
        signals.push(signal);
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { type: 'completed', action: { type: 'check' } };
      },
      emitStatus() {},
      scheduleResolution() {},
    });

  startTurn('room-timeout', 5);
  startTurn('room-cancel', 1_000);
  coordinator.cancelRoom('room-cancel');
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(signals.length, 2);
  assert.equal(signals[0]?.aborted, true, 'timed-out turn is aborted');
  assert.equal(signals[1]?.aborted, true, 'cancelled room turn is aborted');
});
