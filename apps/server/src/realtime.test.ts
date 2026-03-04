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

function waitForActionRequired(
  socket: ReturnType<typeof createClient>,
  predicate: (payload: any) => boolean,
  timeoutMs = 2000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:action_required', onActionRequired);
      reject(new Error('timed out waiting for game:action_required'));
    }, timeoutMs);

    const onActionRequired = (payload: any) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      socket.off('game:action_required', onActionRequired);
      resolve(payload);
    };

    socket.on('game:action_required', onActionRequired);
  });
}

function waitForHandResult(
  socket: ReturnType<typeof createClient>,
  predicate: (payload: any) => boolean,
  timeoutMs = 2000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:hand_result', onHandResult);
      reject(new Error('timed out waiting for game:hand_result'));
    }, timeoutMs);

    const onHandResult = (payload: any) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      socket.off('game:hand_result', onHandResult);
      resolve(payload);
    };

    socket.on('game:hand_result', onHandResult);
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

test('game:start initializes hand and game:action enforces current actor', async (t) => {
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
  const carol = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    alice.close();
    bob.close();
    carol.close();
  });

  await once(alice, 'connect');
  await once(bob, 'connect');
  await once(carol, 'connect');

  await emitWithAck(alice, 'room:create', {
    roomId: 'room-2',
    smallBlind: 50,
    bigBlind: 100
  });

  await emitWithAck(alice, 'room:join', {
    roomId: 'room-2',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-2',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });
  await emitWithAck(carol, 'room:join', {
    roomId: 'room-2',
    playerId: 'p2',
    playerName: 'Carol',
    seatIndex: 2,
    stack: 1000
  });

  const firstState = waitForState(alice, () => true);
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-2',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const started = await firstState;
  assert.equal(started.hand.phase, 'betting_preflop');
  assert.equal(started.hand.currentActorSeat, 0);

  const spoofAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:action', {
    roomId: 'room-2',
    playerId: 'p0',
    type: 'call',
    seq: 1
  });
  assert.deepEqual(spoofAck, { ok: false, error: 'not_room_member' });

  const bobAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:action', {
    roomId: 'room-2',
    playerId: 'p1',
    type: 'fold',
    seq: 1
  });
  assert.deepEqual(bobAck, { ok: false, error: 'not_current_actor' });

  const nextStatePromise = waitForState(alice, (payload) => payload.hand.currentActorSeat === 1);
  const aliceAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'room-2',
    playerId: 'p0',
    type: 'call',
    seq: 1
  });
  assert.deepEqual(aliceAck, { ok: true });

  const nextState = await nextStatePromise;
  assert.equal(nextState.hand.currentActorSeat, 1);
});

test('game:start emits action_required to current human actor', async (t) => {
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
    roomId: 'room-8',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-8',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-8',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const actionRequiredPromise = waitForActionRequired(alice, (payload) => payload.playerId === 'p0');
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-8',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const actionRequired = await actionRequiredPromise;
  assert.equal(actionRequired.roomId, 'room-8');
  assert.equal(actionRequired.playerId, 'p0');
  assert.equal(actionRequired.timeoutMs, 30000);
  assert.equal(actionRequired.validActions.canCall, true);
  assert.equal(actionRequired.validActions.callAmount, 50);
});

test('game:start action_required timeout follows configured actionTimeoutMs', async (t) => {
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

  t.after(() => {
    alice.close();
    bob.close();
  });

  await once(alice, 'connect');
  await once(bob, 'connect');

  await emitWithAck(alice, 'room:create', {
    roomId: 'room-12',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-12',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-12',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const actionRequiredPromise = waitForActionRequired(alice, (payload) => payload.playerId === 'p0');
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-12',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const actionRequired = await actionRequiredPromise;
  assert.equal(actionRequired.timeoutMs, 40);
});

test('game:hand_result is broadcast when hand reaches hand_end', async (t) => {
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
    roomId: 'room-9',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-9',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-9',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-9',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const aliceHandResultPromise = waitForHandResult(alice, (payload) => payload.roomId === 'room-9');
  const bobHandResultPromise = waitForHandResult(bob, (payload) => payload.roomId === 'room-9');
  const foldAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'room-9',
    playerId: 'p0',
    type: 'fold',
    seq: 1
  });
  assert.deepEqual(foldAck, { ok: true });

  const [aliceHandResult, bobHandResult] = await Promise.all([aliceHandResultPromise, bobHandResultPromise]);
  assert.equal(aliceHandResult.roomId, 'room-9');
  assert.equal(aliceHandResult.phase, 'hand_end');
  assert.equal(Array.isArray(aliceHandResult.payouts), true);
  assert.deepEqual(bobHandResult, aliceHandResult);
});

test('action timer auto-folds actor when toCall is greater than zero', async (t) => {
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

  t.after(() => {
    alice.close();
    bob.close();
  });

  await once(alice, 'connect');
  await once(bob, 'connect');

  await emitWithAck(alice, 'room:create', {
    roomId: 'room-10',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-10',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-10',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const handEndStatePromise = waitForState(alice, (payload) => payload.hand.phase === 'hand_end', 1500);
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-10',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const handEndState = await handEndStatePromise;
  const timedOutPlayer = handEndState.hand.players.find((player: { id: string }) => player.id === 'p0');
  assert.equal(timedOutPlayer?.status, 'folded');
});

test('action timer auto-checks actor when toCall is zero', async (t) => {
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

  t.after(() => {
    alice.close();
    bob.close();
  });

  await once(alice, 'connect');
  await once(bob, 'connect');

  await emitWithAck(alice, 'room:create', {
    roomId: 'room-11',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-11',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-11',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-11',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const flopStatePromise = waitForState(
    alice,
    (payload) =>
      payload.hand.phase === 'betting_flop' &&
      payload.hand.currentActorSeat === 0 &&
      payload.hand.communityCards.length === 3,
    1500
  );

  const callAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'room-11',
    playerId: 'p0',
    type: 'call',
    seq: 1
  });
  assert.deepEqual(callAck, { ok: true });

  const flopState = await flopStatePromise;
  assert.equal(flopState.hand.phase, 'betting_flop');
  assert.equal(flopState.hand.currentActorSeat, 0);
  assert.equal(flopState.hand.communityCards.length, 3);
});

test('game:state hides opponent hole cards before hand_end', async (t) => {
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
    roomId: 'room-5',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-5',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-5',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const aliceStatePromise = waitForState(alice, () => true);
  const bobStatePromise = waitForState(bob, () => true);
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-5',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const [aliceState, bobState] = await Promise.all([aliceStatePromise, bobStatePromise]);
  const aliceViewSelf = aliceState.hand.players.find((player: { id: string }) => player.id === 'p0');
  const aliceViewOpponent = aliceState.hand.players.find((player: { id: string }) => player.id === 'p1');
  const bobViewSelf = bobState.hand.players.find((player: { id: string }) => player.id === 'p1');
  const bobViewOpponent = bobState.hand.players.find((player: { id: string }) => player.id === 'p0');

  assert.equal(aliceViewSelf?.holeCards.length, 2);
  assert.equal(aliceViewOpponent?.holeCards.length, 0);
  assert.equal(bobViewSelf?.holeCards.length, 2);
  assert.equal(bobViewOpponent?.holeCards.length, 0);
});

test('game:start rejects non-room member socket', async (t) => {
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
  const outsider = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    alice.close();
    outsider.close();
  });

  await once(alice, 'connect');
  await once(outsider, 'connect');

  await emitWithAck(alice, 'room:create', {
    roomId: 'room-4',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-4',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(outsider, 'game:start', {
    roomId: 'room-4',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: false, error: 'not_room_member' });
});

test('game:start rejects when a hand is already in progress', async (t) => {
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
    roomId: 'room-6',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-6',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-6',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const firstStartAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-6',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(firstStartAck, { ok: true });

  const secondStartAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-6',
    buttonMarkerSeat: 1
  });
  assert.deepEqual(secondStartAck, { ok: false, error: 'hand_already_started' });
});

test('game:action rejects duplicate client seq for same player', async (t) => {
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
    roomId: 'room-7',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-7',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-7',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-7',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const firstActionAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'room-7',
    playerId: 'p0',
    type: 'call',
    seq: 1
  });
  assert.deepEqual(firstActionAck, { ok: true });

  const duplicateAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'room-7',
    playerId: 'p0',
    type: 'call',
    seq: 1
  });
  assert.deepEqual(duplicateAck, { ok: false, error: 'duplicate_action_seq' });
});

test('game loop auto-runs bot turns until next human actor', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app);

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const human = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const botClient = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    human.close();
    botClient.close();
  });

  await once(human, 'connect');
  await once(botClient, 'connect');

  await emitWithAck(human, 'room:create', {
    roomId: 'room-3',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(human, 'room:join', {
    roomId: 'room-3',
    playerId: 'human-1',
    playerName: 'Human',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(botClient, 'room:join', {
    roomId: 'room-3',
    playerId: 'bot-1',
    playerName: 'Bot',
    seatIndex: 1,
    stack: 1000,
    isBot: true
  });

  const startState = waitForState(human, () => true);
  await emitWithAck(human, 'game:start', {
    roomId: 'room-3',
    buttonMarkerSeat: 0
  });
  await startState;

  const botTurnState = waitForState(
    human,
    (payload) => payload.hand.phase === 'betting_preflop' && payload.hand.currentActorSeat === 1
  );
  const humanTurnAfterBotActions = waitForState(
    human,
    (payload) =>
      payload.hand.phase === 'betting_flop' &&
      payload.hand.currentActorSeat === 0 &&
      payload.hand.communityCards.length === 3,
    1200
  );
  const actionAck = await emitWithAck<{ ok: boolean; error?: string }>(human, 'game:action', {
    roomId: 'room-3',
    playerId: 'human-1',
    type: 'call',
    seq: 1
  });

  assert.deepEqual(actionAck, { ok: true });
  const pending = await botTurnState;
  assert.equal(pending.hand.currentActorSeat, 1);
  assert.equal(pending.hand.phase, 'betting_preflop');

  const advanced = await humanTurnAfterBotActions;
  assert.equal(advanced.hand.phase, 'betting_flop');
  assert.equal(advanced.hand.currentActorSeat, 0);
  assert.equal(advanced.hand.communityCards.length, 3);
});
