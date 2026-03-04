import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { io as createClient } from 'socket.io-client';

import { createServer } from './index.ts';
import { attachRealtime } from './realtime.ts';

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

function waitForRoomState(
  socket: ReturnType<typeof createClient>,
  predicate: (payload: any) => boolean,
  timeoutMs = 2000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('room:state', onRoomState);
      reject(new Error('timed out waiting for room:state'));
    }, timeoutMs);

    const onRoomState = (payload: any) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      socket.off('room:state', onRoomState);
      resolve(payload);
    };

    socket.on('room:state', onRoomState);
  });
}

function waitForState(
  socket: ReturnType<typeof createClient>,
  predicate: (payload: any) => boolean,
  timeoutMs = 2000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:state', onState);
      reject(new Error('timed out waiting for game:state'));
    }, timeoutMs);

    const onState = (payload: any) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      socket.off('game:state', onState);
      resolve(payload);
    };

    socket.on('game:state', onState);
  });
}

test('room:leave removes room membership and broadcasts updated room state', async (t) => {
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
    roomId: 'room-leave-1',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-leave-1',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-leave-1',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const roomStatePromise = waitForRoomState(
    alice,
    (payload) => payload.roomId === 'room-leave-1' && payload.playerCount === 1,
    2500
  );
  void roomStatePromise.catch(() => {});

  const leaveAck = await emitWithAck<{ ok: boolean; roomId?: string; playerCount?: number; error?: string }>(
    bob,
    'room:leave',
    {}
  );
  assert.deepEqual(leaveAck, { ok: true, roomId: 'room-leave-1', playerCount: 1 });

  const roomState = await roomStatePromise;
  assert.equal(roomState.readyCount, 0);

  const postLeaveStartAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:start', {
    roomId: 'room-leave-1',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(postLeaveStartAck, { ok: false, error: 'not_room_member' });
});

test('room:leave during active hand keeps seat until hand_end then cleans it up', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, { actionTimeoutMs: 40 });

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const alice = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const bob = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  let charlie: ReturnType<typeof createClient> | null = null;

  t.after(() => {
    alice.close();
    bob.close();
    charlie?.close();
  });

  await once(alice, 'connect');
  await once(bob, 'connect');

  await emitWithAck(alice, 'room:create', {
    roomId: 'room-leave-2',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-leave-2',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-leave-2',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-leave-2',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const handEndStatePromise = waitForState(bob, (payload) => payload.hand.phase === 'hand_end', 1500);
  const postHandRoomStatePromise = waitForRoomState(
    bob,
    (payload) => payload.roomId === 'room-leave-2' && payload.playerCount === 1,
    1500
  );

  const leaveAck = await emitWithAck<{ ok: boolean; roomId?: string; playerCount?: number; error?: string }>(
    alice,
    'room:leave',
    {}
  );
  assert.deepEqual(leaveAck, { ok: true, roomId: 'room-leave-2', playerCount: 2 });

  await handEndStatePromise;
  const postHandRoomState = await postHandRoomStatePromise;
  assert.equal(postHandRoomState.readyCount, 0);

  const bobReadyAck = await emitWithAck<{ ok: boolean; roomId?: string; readyCount?: number; playerCount?: number }>(
    bob,
    'room:ready',
    {}
  );
  assert.deepEqual(bobReadyAck, { ok: true, roomId: 'room-leave-2', readyCount: 1, playerCount: 1 });

  charlie = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  await once(charlie, 'connect');
  const playerCountTwoStatePromise = waitForRoomState(
    bob,
    (payload) => payload.roomId === 'room-leave-2' && payload.playerCount === 2,
    1500
  );
  await emitWithAck(charlie, 'room:join', {
    roomId: 'room-leave-2',
    playerId: 'p2',
    playerName: 'Charlie',
    seatIndex: 2,
    stack: 1000
  });
  await playerCountTwoStatePromise;

  const charlieReadyAck = await emitWithAck<{
    ok: boolean;
    roomId?: string;
    readyCount?: number;
    playerCount?: number;
  }>(charlie, 'room:ready', {});
  assert.deepEqual(charlieReadyAck, { ok: true, roomId: 'room-leave-2', readyCount: 2, playerCount: 2 });

  const nextStartAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:start', {
    roomId: 'room-leave-2',
    buttonMarkerSeat: 1
  });
  assert.deepEqual(nextStartAck, { ok: true });
});
