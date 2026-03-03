import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { io as createClient } from 'socket.io-client';

import { createServer } from './index.ts';
import { attachRealtime } from './realtime.ts';

function emitWithAck<T>(socket: ReturnType<typeof createClient>, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (ack: T) => resolve(ack));
  });
}

test('room:join returns ack and tracks room player count', async (t) => {
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

  const ack1 = await emitWithAck<{ ok: true; roomId: string; playerCount: number }>(alice, 'room:join', {
    roomId: 'room-1',
    playerId: 'p1',
    playerName: 'Alice'
  });

  assert.deepEqual(ack1, { ok: true, roomId: 'room-1', playerCount: 1 });

  const ack2 = await emitWithAck<{ ok: true; roomId: string; playerCount: number }>(bob, 'room:join', {
    roomId: 'room-1',
    playerId: 'p2',
    playerName: 'Bob'
  });

  assert.deepEqual(ack2, { ok: true, roomId: 'room-1', playerCount: 2 });
});

test('room:join rejects invalid payload', async (t) => {
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

  t.after(() => {
    alice.close();
  });

  await once(alice, 'connect');

  const ack = await emitWithAck<{ ok: false; error: string }>(alice, 'room:join', {
    roomId: '',
    playerId: '',
    playerName: ''
  });

  assert.deepEqual(ack, { ok: false, error: 'invalid_payload' });
});
