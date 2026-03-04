import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { io as createClient } from 'socket.io-client';

import { createServer } from '../../../index.ts';
import { attachRealtime } from '../../../realtime.ts';

function emitWithAck<T>(
  socket: ReturnType<typeof createClient>,
  event: string,
  payload: unknown,
  timeoutMs = 2000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting ack for ${event}`));
    }, timeoutMs);

    socket.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

test('game:action enforces per-socket rate limit at 20 actions per minute', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app);

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const alice = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const bob = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    alice.close();
    bob.close();
  });

  await once(alice, 'connect');
  await once(bob, 'connect');

  await emitWithAck(alice, 'room:create', {
    roomId: 'room-rate-limit-1',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-rate-limit-1',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-rate-limit-1',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-rate-limit-1',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  for (let seq = 1; seq <= 20; seq += 1) {
    const actionAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:action', {
      roomId: 'room-rate-limit-1',
      playerId: 'p1',
      type: 'call',
      seq
    });
    assert.deepEqual(actionAck, { ok: false, error: 'not_current_actor' });
  }

  const limitedAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:action', {
    roomId: 'room-rate-limit-1',
    playerId: 'p1',
    type: 'call',
    seq: 21
  });
  assert.deepEqual(limitedAck, { ok: false, error: 'rate_limited' });
});
