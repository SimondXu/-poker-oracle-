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

function waitForEitherActionRequired(
  leftSocket: ReturnType<typeof createClient>,
  rightSocket: ReturnType<typeof createClient>,
  predicate: (payload: any) => boolean,
  timeoutMs = 2000
): Promise<'left' | 'right'> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      leftSocket.off('game:action_required', onLeft);
      rightSocket.off('game:action_required', onRight);
      reject(new Error('timed out waiting for game:action_required on either socket'));
    }, timeoutMs);

    const onLeft = (payload: any) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      leftSocket.off('game:action_required', onLeft);
      rightSocket.off('game:action_required', onRight);
      resolve('left');
    };

    const onRight = (payload: any) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      leftSocket.off('game:action_required', onLeft);
      rightSocket.off('game:action_required', onRight);
      resolve('right');
    };

    leftSocket.on('game:action_required', onLeft);
    rightSocket.on('game:action_required', onRight);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
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

function waitForGameEvent(
  socket: ReturnType<typeof createClient>,
  predicate: (payload: any) => boolean,
  timeoutMs = 2000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:event', onGameEvent);
      reject(new Error('timed out waiting for game:event'));
    }, timeoutMs);

    const onGameEvent = (payload: any) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      socket.off('game:event', onGameEvent);
      resolve(payload);
    };

    socket.on('game:event', onGameEvent);
  });
}

async function issueGuestSession(
  baseUrl: string,
  username?: string
): Promise<{ cookie: string; user: { id: string; username: string; isGuest: boolean } }> {
  const response = await fetch(`${baseUrl}/api/auth/guest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(username ? { username } : {})
  });
  assert.equal(response.status, 200);

  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('missing auth cookie');
  }

  const body = (await response.json()) as { ok: boolean; user: { id: string; username: string; isGuest: boolean } };
  if (!body.ok) {
    throw new Error('failed to issue guest session');
  }

  return {
    cookie: setCookie.split(';', 1)[0] ?? setCookie,
    user: body.user
  };
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

test('room:join binds human player identity to cookie session when playerId is omitted', async (t) => {
  const nowMs = () => 42;
  const app = createServer({ nowMs });
  const io = attachRealtime(app, { nowMs });

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const guest = await issueGuestSession(url, 'Alice');

  const socket = createClient(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: {
      Cookie: guest.cookie
    }
  });

  t.after(() => {
    socket.close();
  });

  await once(socket, 'connect');

  const statePromise = waitForRoomState(socket, (payload) => payload.roomId === 'room-auth-1' && payload.playerCount === 1);
  const joinAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:join', {
    roomId: 'room-auth-1',
    playerName: 'Alice'
  });

  assert.deepEqual(joinAck, { ok: true, roomId: 'room-auth-1', playerCount: 1 });
  const state = await statePromise;
  assert.equal(state.players[0]?.id, guest.user.id);
});

test('room:join rejects spoofed playerId when cookie session is present', async (t) => {
  const nowMs = () => 42;
  const app = createServer({ nowMs });
  const io = attachRealtime(app, { nowMs });

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const guest = await issueGuestSession(url, 'Alice');

  const socket = createClient(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: {
      Cookie: guest.cookie
    }
  });

  t.after(() => {
    socket.close();
  });

  await once(socket, 'connect');
  const joinAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:join', {
    roomId: 'room-auth-2',
    playerId: 'spoofed-player-id',
    playerName: 'Alice'
  });

  assert.deepEqual(joinAck, { ok: false, error: 'unauthorized' });
});

test('room:join rejects unauthenticated human join when authStrict is enabled', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, { authStrict: true });

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const socket = createClient(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });

  t.after(() => {
    socket.close();
  });

  await once(socket, 'connect');
  const joinAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:join', {
    roomId: 'room-auth-strict',
    playerId: 'p0',
    playerName: 'Alice'
  });

  assert.deepEqual(joinAck, { ok: false, error: 'unauthorized' });
});

test('room:ready marks membership as ready and updates room state', async (t) => {
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

  await emitWithAck(alice, 'room:create', {
    roomId: 'room-ready-1',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-ready-1',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });

  const roomStatePromise = waitForRoomState(alice, (payload) => payload.roomId === 'room-ready-1' && payload.readyCount === 1);
  const readyAck = await emitWithAck<{ ok: boolean; error?: string; readyCount?: number }>(alice, 'room:ready', {});

  assert.deepEqual(readyAck, { ok: true, roomId: 'room-ready-1', readyCount: 1, playerCount: 1 });
  const roomState = await roomStatePromise;
  assert.equal(roomState.readyCount, 1);
});

test('game:start requires all players ready once readiness flow starts', async (t) => {
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
    roomId: 'room-ready-2',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-ready-2',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-ready-2',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const aliceReadyAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'room:ready', {});
  assert.deepEqual(aliceReadyAck, { ok: true, roomId: 'room-ready-2', readyCount: 1, playerCount: 2 });

  const blockedStartAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-ready-2',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(blockedStartAck, { ok: false, error: 'players_not_ready' });

  const bobReadyAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'room:ready', {});
  assert.deepEqual(bobReadyAck, { ok: true, roomId: 'room-ready-2', readyCount: 2, playerCount: 2 });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-ready-2',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });
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
  assert.equal(started.hand.smallBlind, 50);
  assert.equal(started.hand.bigBlind, 100);
  assert.equal(typeof started.hand.maxSeats, 'number');
  const self = started.hand.players.find((player: { id: string }) => player.id === 'p0');
  assert.equal(self?.name, 'Alice');
  assert.equal(self?.isBot, false);

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
  assert.equal(actionRequired.validActions.canBet, false);
  assert.equal(actionRequired.validActions.canRaise, true);
  assert.equal(actionRequired.validActions.minBetOrRaiseTo, 200);
  assert.equal(actionRequired.validActions.maxBetOrRaiseTo, 1000);
});

test('room:join during active hand does not re-emit action_required to existing actor sockets', async (t) => {
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
  const charlie = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    alice.close();
    bob.close();
    charlie.close();
  });

  await once(alice, 'connect');
  await once(bob, 'connect');
  await once(charlie, 'connect');

  await emitWithAck(alice, 'room:create', {
    roomId: 'room-join-no-duplicate-action-required',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-join-no-duplicate-action-required',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-join-no-duplicate-action-required',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  let aliceActionRequiredCount = 0;
  let bobActionRequiredCount = 0;
  alice.on('game:action_required', () => {
    aliceActionRequiredCount += 1;
  });
  bob.on('game:action_required', () => {
    bobActionRequiredCount += 1;
  });

  const initialActionRequired = waitForEitherActionRequired(
    alice,
    bob,
    (payload) => payload.roomId === 'room-join-no-duplicate-action-required'
  );
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-join-no-duplicate-action-required',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });
  await initialActionRequired;

  const baselineAliceCount = aliceActionRequiredCount;
  const baselineBobCount = bobActionRequiredCount;
  assert.equal(baselineAliceCount + baselineBobCount, 1);

  const joinAck = await emitWithAck<{ ok: boolean; roomId?: string; playerCount?: number; error?: string }>(
    charlie,
    'room:join',
    {
      roomId: 'room-join-no-duplicate-action-required',
      playerId: 'p2',
      playerName: 'Charlie',
      seatIndex: 2,
      stack: 1000
    }
  );
  assert.deepEqual(joinAck, {
    ok: true,
    roomId: 'room-join-no-duplicate-action-required',
    playerCount: 3
  });

  await sleep(80);
  assert.equal(aliceActionRequiredCount, baselineAliceCount);
  assert.equal(bobActionRequiredCount, baselineBobCount);
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

test('game:event broadcasts applied player actions to room members', async (t) => {
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
    roomId: 'room-13',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-13',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-13',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-13',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const aliceGameEventPromise = waitForGameEvent(
    alice,
    (payload) =>
      payload.roomId === 'room-13' &&
      payload.type === 'action_applied' &&
      payload.action?.playerId === 'p0' &&
      payload.action?.type === 'call'
  );
  const bobGameEventPromise = waitForGameEvent(
    bob,
    (payload) =>
      payload.roomId === 'room-13' &&
      payload.type === 'action_applied' &&
      payload.action?.playerId === 'p0' &&
      payload.action?.type === 'call'
  );

  const actionAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'room-13',
    playerId: 'p0',
    type: 'call',
    seq: 1
  });
  assert.deepEqual(actionAck, { ok: true });

  const [aliceEvent, bobEvent] = await Promise.all([aliceGameEventPromise, bobGameEventPromise]);
  assert.equal(aliceEvent.action.phase, 'betting_preflop');
  assert.deepEqual(bobEvent, aliceEvent);
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

test('game:action accepts bet on unopened street', async (t) => {
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
    roomId: 'room-15',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-15',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-15',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-15',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const nextStatePromise = waitForState(
    alice,
    (payload) => payload.hand.phase === 'betting_preflop' && payload.hand.currentActorSeat === 1 && payload.hand.betting.currentBetToMatch === 200,
    1500
  );
  const betAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'room-15',
    playerId: 'p0',
    type: 'bet',
    amount: 200,
    seq: 1
  });
  assert.deepEqual(betAck, { ok: true });
  await nextStatePromise;
});

test('disconnecting current actor still allows timeout auto-fold progression', async (t) => {
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
    roomId: 'room-14',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-14',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-14',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-14',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const handEndStatePromise = waitForState(bob, (payload) => payload.hand.phase === 'hand_end', 1500);
  alice.close();

  const handEndState = await handEndStatePromise;
  const disconnectedActor = handEndState.hand.players.find((player: { id: string }) => player.id === 'p0');
  assert.equal(disconnectedActor?.status, 'folded');
});

test('disconnected in-hand player is removed after hand_end so next hand can start', async (t) => {
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
    roomId: 'room-15',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'room-15',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'room-15',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-15',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const handEndStatePromise = waitForState(bob, (payload) => payload.hand.phase === 'hand_end', 1500);
  const postHandRoomStatePromise = waitForRoomState(
    bob,
    (payload) => payload.roomId === 'room-15' && payload.playerCount === 1,
    1500
  );
  alice.close();

  await handEndStatePromise;
  const postHandRoomState = await postHandRoomStatePromise;
  assert.equal(postHandRoomState.readyCount, 0);

  const readyAck = await emitWithAck<{ ok: boolean; roomId?: string; readyCount?: number; playerCount?: number }>(
    bob,
    'room:ready',
    {}
  );
  assert.deepEqual(readyAck, { ok: true, roomId: 'room-15', readyCount: 1, playerCount: 1 });

  const charlie = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => {
    charlie.close();
  });
  await once(charlie, 'connect');
  const playerCountTwoStatePromise = waitForRoomState(
    bob,
    (payload) => payload.roomId === 'room-15' && payload.playerCount === 2,
    1500
  );
  await emitWithAck(charlie, 'room:join', {
    roomId: 'room-15',
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
  assert.deepEqual(charlieReadyAck, { ok: true, roomId: 'room-15', readyCount: 2, playerCount: 2 });

  const nextStartAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:start', {
    roomId: 'room-15',
    buttonMarkerSeat: 1
  });
  assert.deepEqual(nextStartAck, { ok: true });
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

test('game:state includes stateVersion and rejects stale expectedVersion', async (t) => {
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

  const startStatePromise = waitForState(alice, (payload) => payload.roomId === 'room-8');
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'room-8',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const startState = await startStatePromise;
  assert.equal(typeof startState.stateVersion, 'number');

  const staleExpectedVersion = startState.stateVersion;
  const advancedStatePromise = waitForState(
    alice,
    (payload) => payload.roomId === 'room-8' && payload.stateVersion > staleExpectedVersion && payload.hand.currentActorSeat === 1
  );
  const actionAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'room-8',
    playerId: 'p0',
    type: 'call',
    seq: 1,
    expectedVersion: staleExpectedVersion
  });
  assert.deepEqual(actionAck, { ok: true });

  await advancedStatePromise;

  const staleVersionAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:action', {
    roomId: 'room-8',
    playerId: 'p1',
    type: 'check',
    seq: 1,
    expectedVersion: staleExpectedVersion
  });
  assert.deepEqual(staleVersionAck, { ok: false, error: 'stale_state_version' });
});

test('game loop auto-runs bot turns and returns control to human or ends hand', async (t) => {
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
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(human, 'game:start', {
    roomId: 'room-3',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });
  await startState;

  const handProgressAfterBotActions = waitForState(
    human,
    (payload) =>
      payload.hand.actions.length >= 2 && (payload.hand.currentActorSeat === 0 || payload.hand.phase === 'hand_end'),
    5000
  );
  const actionAck = await emitWithAck<{ ok: boolean; error?: string }>(human, 'game:action', {
    roomId: 'room-3',
    playerId: 'human-1',
    type: 'call',
    seq: 1
  });

  assert.deepEqual(actionAck, { ok: true });
  const advanced = await handProgressAfterBotActions;
  const botActions = advanced.hand.actions.filter((action: { playerId: string }) => action.playerId === 'bot-1');
  assert.equal(botActions.length >= 1, true);
  const returnedToHuman = advanced.hand.currentActorSeat === 0;
  const handEnded = advanced.hand.phase === 'hand_end';
  assert.equal(returnedToHuman || handEnded, true);
});
