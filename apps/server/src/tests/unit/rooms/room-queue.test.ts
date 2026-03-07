import assert from 'node:assert/strict';
import test from 'node:test';

import { enqueueRoomTask, type RoomTaskQueues } from '../../../rooms/room-queue.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('enqueueRoomTask runs tasks sequentially for the same room', async () => {
  const roomTaskQueues: RoomTaskQueues = new Map();
  const order: string[] = [];

  const first = enqueueRoomTask(roomTaskQueues, 'room-1', async () => {
    order.push('first:start');
    await sleep(25);
    order.push('first:end');
  });

  const second = enqueueRoomTask(roomTaskQueues, 'room-1', async () => {
    order.push('second');
  });

  await Promise.all([first, second]);

  assert.deepEqual(order, ['first:start', 'first:end', 'second']);
  assert.equal(roomTaskQueues.size, 0);
});

test('enqueueRoomTask allows different rooms to progress independently', async () => {
  const roomTaskQueues: RoomTaskQueues = new Map();
  const order: string[] = [];

  const room1 = enqueueRoomTask(roomTaskQueues, 'room-1', async () => {
    order.push('room1:start');
    await sleep(30);
    order.push('room1:end');
  });

  const room2 = enqueueRoomTask(roomTaskQueues, 'room-2', async () => {
    order.push('room2');
  });

  await Promise.all([room1, room2]);

  assert.equal(order[0], 'room1:start');
  assert.equal(order[1], 'room2');
  assert.equal(order[2], 'room1:end');
});
