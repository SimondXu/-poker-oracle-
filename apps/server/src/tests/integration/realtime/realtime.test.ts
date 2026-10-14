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

function sequenceRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
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

  const createAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'room:create', {
    roomId: 'AAAAAB',
    smallBlind: 10,
    bigBlind: 20
  });
  assert.deepEqual(createAck, { ok: true, roomId: 'AAAAAB' });

  const ack1 = await emitWithAck<{ ok: true; roomId: string; playerCount: number }>(alice, 'room:join', {
    roomId: 'AAAAAB',
    playerId: 'p1',
    playerName: 'Alice'
  });

  assert.deepEqual(ack1, { ok: true, roomId: 'AAAAAB', playerCount: 1 });

  const ack2 = await emitWithAck<{ ok: true; roomId: string; playerCount: number }>(bob, 'room:join', {
    roomId: 'AAAAAB',
    playerId: 'p2',
    playerName: 'Bob'
  });

  assert.deepEqual(ack2, { ok: true, roomId: 'AAAAAB', playerCount: 2 });
});

test('room:join rejects when room does not exist', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app);

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    socket.close();
  });

  await once(socket, 'connect');

  const joinAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:join', {
    roomId: 'AAAAA4',
    playerId: 'p1',
    playerName: 'Alice'
  });

  assert.deepEqual(joinAck, { ok: false, error: 'room_not_found' });
});

test('room:join normalizes lowercase room code to existing room', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app);

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    socket.close();
  });

  await once(socket, 'connect');

  const createAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:create', {
    roomId: 'AAAABA',
    smallBlind: 10,
    bigBlind: 20
  });
  assert.deepEqual(createAck, { ok: true, roomId: 'AAAABA' });

  const joinAck = await emitWithAck<{ ok: boolean; roomId?: string; playerCount?: number; error?: string }>(
    socket,
    'room:join',
    {
      roomId: 'aaaaba',
      playerId: 'p1',
      playerName: 'Alice'
    }
  );

  assert.deepEqual(joinAck, { ok: true, roomId: 'AAAABA', playerCount: 1 });
});

test('room:create rejects duplicate room id', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app);

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    socket.close();
  });

  await once(socket, 'connect');

  const firstCreateAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:create', {
    roomId: 'AAAAAX',
    smallBlind: 10,
    bigBlind: 20
  });
  assert.deepEqual(firstCreateAck, { ok: true, roomId: 'AAAAAX' });

  const secondCreateAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:create', {
    roomId: 'AAAAAX',
    smallBlind: 10,
    bigBlind: 20
  });
  assert.deepEqual(secondCreateAck, { ok: false, error: 'room_already_exists' });
});

test('room:create rejects invalid room code', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app);

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    socket.close();
  });

  await once(socket, 'connect');

  const invalidCreateAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:create', {
    roomId: 'room-duplicate',
    smallBlind: 10,
    bigBlind: 20
  });
  assert.deepEqual(invalidCreateAck, { ok: false, error: 'invalid_payload' });
});

test('room:create rejects unauthenticated create when authStrict is enabled', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, { authStrict: true });

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    socket.close();
  });

  await once(socket, 'connect');

  const createAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:create', {
    roomId: 'AAAABB',
    smallBlind: 10,
    bigBlind: 20
  });
  assert.deepEqual(createAck, { ok: false, error: 'unauthorized' });
});

test('room:create enforces per-socket rate limit at 10 creates per minute', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app);

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    socket.close();
  });

  await once(socket, 'connect');

  const roomIds = ['AAAABC', 'AAAABD', 'AAAABE', 'AAAABF', 'AAAABG', 'AAAABH', 'AAAABJ', 'AAAABK', 'AAAABL', 'AAAABM'];

  for (const roomId of roomIds) {
    const createAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:create', {
      roomId,
      smallBlind: 10,
      bigBlind: 20
    });
    assert.deepEqual(createAck, { ok: true, roomId });
  }

  const limitedAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:create', {
    roomId: 'AAAABN',
    smallBlind: 10,
    bigBlind: 20
  });
  assert.deepEqual(limitedAck, { ok: false, error: 'rate_limited' });
});

test('empty rooms created without members expire and can be recreated', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, { emptyRoomTtlMs: 30 });

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    socket.close();
  });

  await once(socket, 'connect');

  const firstCreateAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:create', {
    roomId: 'ABCD23',
    smallBlind: 10,
    bigBlind: 20
  });
  assert.deepEqual(firstCreateAck, { ok: true, roomId: 'ABCD23' });

  await sleep(60);

  const secondCreateAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:create', {
    roomId: 'ABCD23',
    smallBlind: 10,
    bigBlind: 20
  });
  assert.deepEqual(secondCreateAck, { ok: true, roomId: 'ABCD23' });
});

test('room:join rejects duplicate playerName in the same room', async (t) => {
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
    roomId: 'AAAAA5',
    smallBlind: 10,
    bigBlind: 20
  });
  const firstJoinAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'room:join', {
    roomId: 'AAAAA5',
    playerId: 'p1',
    playerName: 'Alice'
  });
  assert.deepEqual(firstJoinAck, { ok: true, roomId: 'AAAAA5', playerCount: 1 });

  const secondJoinAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'room:join', {
    roomId: 'AAAAA5',
    playerId: 'p2',
    playerName: '  alice  '
  });
  assert.deepEqual(secondJoinAck, { ok: false, error: 'player_name_taken' });
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

test('room:remove_player normalizes lowercase room code for bot removal', async (t) => {
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
    roomId: 'AAAABQ',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAABQ',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAABQ',
    playerId: 'bot-fish-1',
    playerName: 'FISH Bot 2',
    seatIndex: 1,
    stack: 1000,
    isBot: true,
    botStrategy: 'fish'
  });

  const removeAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'room:remove_player', {
    roomId: 'aaaabq',
    playerId: 'bot-fish-1',
  });

  assert.deepEqual(removeAck, { ok: true });
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

  const createAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:create', {
    roomId: 'AAAAAS',
    smallBlind: 10,
    bigBlind: 20
  });
  assert.deepEqual(createAck, { ok: true, roomId: 'AAAAAS' });

  const statePromise = waitForRoomState(socket, (payload) => payload.roomId === 'AAAAAS' && payload.playerCount === 1);
  const joinAck = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'room:join', {
    roomId: 'AAAAAS',
    playerName: 'Alice'
  });

  assert.deepEqual(joinAck, { ok: true, roomId: 'AAAAAS', playerCount: 1 });
  const state = await statePromise;
  assert.equal(state.players[0]?.id, guest.user.id);
});

test('room:join from a second socket for the same guest preserves the existing room player snapshot', async (t) => {
  const nowMs = () => 42;
  const app = createServer({ nowMs });
  const io = attachRealtime(app, { nowMs, authStrict: true });

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const guest = await issueGuestSession(url, 'Alice');

  const firstSocket = createClient(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: {
      Cookie: guest.cookie
    }
  });
  const secondSocket = createClient(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: {
      Cookie: guest.cookie
    }
  });

  t.after(() => {
    firstSocket.close();
    secondSocket.close();
  });

  await once(firstSocket, 'connect');
  await once(secondSocket, 'connect');

  await emitWithAck(firstSocket, 'room:create', {
    roomId: 'AAAABB',
    smallBlind: 10,
    bigBlind: 20
  });
  await emitWithAck(firstSocket, 'room:join', {
    roomId: 'AAAABB',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(firstSocket, 'room:ready', {});

  const roomStatePromise = waitForRoomState(
    secondSocket,
    (payload) =>
      payload.roomId === 'AAAABB'
      && payload.playerCount === 1
      && payload.players[0]?.id === guest.user.id
      && payload.players[0]?.name === 'Alice'
      && payload.players[0]?.seatIndex === 0
      && payload.players[0]?.stack === 1000
      && payload.players[0]?.isReady === true
  );
  const joinAck = await emitWithAck<{ ok: boolean; error?: string; roomId?: string; playerCount?: number }>(
    secondSocket,
    'room:join',
    {
      roomId: 'AAAABB',
      playerName: 'Alice Renamed',
      seatIndex: 4,
      stack: 2500
    }
  );

  assert.deepEqual(joinAck, { ok: true, roomId: 'AAAABB', playerCount: 1 });

  const roomState = await roomStatePromise;
  assert.equal(roomState.players.length, 1);
  assert.equal(roomState.players[0]?.id, guest.user.id);
  assert.equal(roomState.players[0]?.name, 'Alice');
  assert.equal(roomState.players[0]?.seatIndex, 0);
  assert.equal(roomState.players[0]?.stack, 1000);
  assert.equal(roomState.players[0]?.isReady, true);
});

test('disconnecting one of multiple sockets for the same guest does not evict the player', async (t) => {
  const nowMs = () => 42;
  const app = createServer({ nowMs });
  const io = attachRealtime(app, { nowMs, authStrict: true });

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const guest = await issueGuestSession(url, 'Alice');

  const firstSocket = createClient(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: {
      Cookie: guest.cookie
    }
  });
  const secondSocket = createClient(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: {
      Cookie: guest.cookie
    }
  });

  t.after(() => {
    firstSocket.close();
    secondSocket.close();
  });

  await once(firstSocket, 'connect');
  await once(secondSocket, 'connect');

  await emitWithAck(firstSocket, 'room:create', {
    roomId: 'AAAABA',
    smallBlind: 10,
    bigBlind: 20
  });
  await emitWithAck(firstSocket, 'room:join', {
    roomId: 'AAAABA',
    playerName: 'Alice'
  });
  await emitWithAck(secondSocket, 'room:join', {
    roomId: 'AAAABA',
    playerName: 'Alice'
  });

  secondSocket.close();
  await sleep(50);

  const readyAck = await emitWithAck<{ ok: boolean; error?: string; roomId?: string; readyCount?: number; playerCount?: number }>(
    firstSocket,
    'room:ready',
    {}
  );
  assert.deepEqual(readyAck, {
    ok: true,
    roomId: 'AAAABA',
    readyCount: 1,
    playerCount: 1
  });
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
    roomId: 'AAAAAT',
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
    roomId: 'AAAAAU',
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
    roomId: 'AAAAA7',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAA7',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });

  const roomStatePromise = waitForRoomState(alice, (payload) => payload.roomId === 'AAAAA7' && payload.readyCount === 1);
  const readyAck = await emitWithAck<{ ok: boolean; error?: string; readyCount?: number }>(alice, 'room:ready', {});

  assert.deepEqual(readyAck, { ok: true, roomId: 'AAAAA7', readyCount: 1, playerCount: 1 });
  const roomState = await roomStatePromise;
  assert.equal(roomState.readyCount, 1);
  assert.equal(roomState.table.activeStackPlayerCount, 1);
  assert.equal(roomState.table.activeHumanStackPlayerCount, 1);
  assert.equal(roomState.table.activeBotStackPlayerCount, 0);
  assert.equal(roomState.table.canStartNextHand, false);
  assert.equal(roomState.table.isBotsOnlyContinuation, false);
  assert.equal(roomState.table.isTableFinished, false);
  assert.equal(roomState.players[0]?.stack, 1000);
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
    roomId: 'AAAAA8',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAA8',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAA8',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const aliceReadyAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'room:ready', {});
  assert.deepEqual(aliceReadyAck, { ok: true, roomId: 'AAAAA8', readyCount: 1, playerCount: 2 });

  const blockedStartAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAA8',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(blockedStartAck, { ok: false, error: 'players_not_ready' });

  const bobReadyAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'room:ready', {});
  assert.deepEqual(bobReadyAck, { ok: true, roomId: 'AAAAA8', readyCount: 2, playerCount: 2 });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAA8',
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
    roomId: 'AAAAAJ',
    smallBlind: 50,
    bigBlind: 100
  });

  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAJ',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAJ',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });
  await emitWithAck(carol, 'room:join', {
    roomId: 'AAAAAJ',
    playerId: 'p2',
    playerName: 'Carol',
    seatIndex: 2,
    stack: 1000
  });

  const firstState = waitForState(alice, () => true);
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAJ',
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
    roomId: 'AAAAAJ',
    playerId: 'p0',
    type: 'call',
    seq: 1
  });
  assert.deepEqual(spoofAck, { ok: false, error: 'not_room_member' });

  const bobAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:action', {
    roomId: 'AAAAAJ',
    playerId: 'p1',
    type: 'fold',
    seq: 1
  });
  assert.deepEqual(bobAck, { ok: false, error: 'not_current_actor' });

  const nextStatePromise = waitForState(alice, (payload) => payload.hand.currentActorSeat === 1);
  const aliceAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'AAAAAJ',
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
    roomId: 'AAAAAQ',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAQ',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAQ',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const actionRequiredPromise = waitForActionRequired(alice, (payload) => payload.playerId === 'p0');
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAQ',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const actionRequired = await actionRequiredPromise;
  assert.equal(actionRequired.roomId, 'AAAAAQ');
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
    roomId: 'AAAAAY',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAY',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAY',
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
    (payload) => payload.roomId === 'AAAAAY'
  );
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAY',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });
  await initialActionRequired;

  const baselineAliceCount = aliceActionRequiredCount;
  const baselineBobCount = bobActionRequiredCount;
  assert.equal(baselineAliceCount + baselineBobCount, 1);

  const lateJoinGameStatePromise = waitForState(
    charlie,
    (payload) =>
      payload.roomId === 'AAAAAY'
      && payload.hand.phase !== 'hand_end'
      && payload.hand.players.every((player: { id: string }) => player.id !== 'p2'),
  );
  const joinAck = await emitWithAck<{ ok: boolean; roomId?: string; playerCount?: number; error?: string }>(
    charlie,
    'room:join',
    {
      roomId: 'AAAAAY',
      playerId: 'p2',
      playerName: 'Charlie',
      seatIndex: 2,
      stack: 1000
    }
  );
  assert.deepEqual(joinAck, {
    ok: true,
    roomId: 'AAAAAY',
    playerCount: 3
  });

  const lateJoinGameState = await lateJoinGameStatePromise;
  assert.equal(
    lateJoinGameState.hand.players.some((player: { id: string }) => player.id === 'p2'),
    false,
  );

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
    roomId: 'AAAAAE',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAE',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAE',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const actionRequiredPromise = waitForActionRequired(alice, (payload) => payload.playerId === 'p0');
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAE',
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
    roomId: 'AAAAAR',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAR',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAR',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAR',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const aliceHandResultPromise = waitForHandResult(alice, (payload) => payload.roomId === 'AAAAAR');
  const bobHandResultPromise = waitForHandResult(bob, (payload) => payload.roomId === 'AAAAAR');
  const foldAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'AAAAAR',
    playerId: 'p0',
    type: 'fold',
    seq: 1
  });
  assert.deepEqual(foldAck, { ok: true });

  const [aliceHandResult, bobHandResult] = await Promise.all([aliceHandResultPromise, bobHandResultPromise]);
  assert.equal(aliceHandResult.roomId, 'AAAAAR');
  assert.equal(aliceHandResult.phase, 'hand_end');
  assert.equal(Array.isArray(aliceHandResult.payouts), true);
  assert.equal(Array.isArray(aliceHandResult.players), true);
  assert.equal(aliceHandResult.players.length, 2);
  assert.equal(aliceHandResult.table.activeStackPlayerCount, 2);
  assert.equal(aliceHandResult.table.activeHumanStackPlayerCount, 2);
  assert.equal(aliceHandResult.table.activeBotStackPlayerCount, 0);
  assert.equal(typeof aliceHandResult.table.canStartNextHand, 'boolean');
  assert.equal(typeof aliceHandResult.table.isBotsOnlyContinuation, 'boolean');
  assert.equal(typeof aliceHandResult.table.isTableFinished, 'boolean');
  const aliceSnapshot = aliceHandResult.players.find((player: any) => player.id === 'p0');
  const bobSnapshot = aliceHandResult.players.find((player: any) => player.id === 'p1');
  assert.equal(aliceSnapshot?.name, 'Alice');
  assert.equal(bobSnapshot?.name, 'Bob');
  assert.equal(Array.isArray(aliceSnapshot?.holeCards), true);
  assert.equal(Array.isArray(bobSnapshot?.holeCards), true);
  // Won without a showdown: nobody's hole cards are revealed in the room-wide result.
  assert.equal(aliceSnapshot?.holeCards.length, 0);
  assert.equal(bobSnapshot?.holeCards.length, 0);
  assert.deepEqual(bobHandResult, aliceHandResult);
});

test('game:event broadcasts applied player actions to room members', async (t) => {
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

  const alice = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const bob = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    alice.close();
    bob.close();
  });

  await once(alice, 'connect');
  await once(bob, 'connect');

  await emitWithAck(alice, 'room:create', {
    roomId: 'AAAAAF',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAF',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAF',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAF',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const aliceGameEventPromise = waitForGameEvent(
    alice,
    (payload) =>
      payload.roomId === 'AAAAAF' &&
      payload.type === 'action_applied' &&
      payload.action?.playerId === 'p0' &&
      payload.action?.type === 'call'
  );
  const bobGameEventPromise = waitForGameEvent(
    bob,
    (payload) =>
      payload.roomId === 'AAAAAF' &&
      payload.type === 'action_applied' &&
      payload.action?.playerId === 'p0' &&
      payload.action?.type === 'call'
  );

  const actionAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'AAAAAF',
    playerId: 'p0',
    type: 'call',
    seq: 1
  });
  assert.deepEqual(actionAck, { ok: true });

  const [aliceEvent, bobEvent] = await Promise.all([aliceGameEventPromise, bobGameEventPromise]);
  assert.deepEqual(aliceEvent.action, {
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    phase: 'betting_preflop',
    type: 'call',
    amount: 50,
    addedAmount: 50,
    toAmount: 100,
    stackBefore: 950,
    potTotalBefore: 150,
    sequenceNum: 1,
    timestamp: 42,
  });
  assert.deepEqual(bobEvent, aliceEvent);
});

test('game:state exposes real action history metadata to clients', async (t) => {
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

  const alice = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const bob = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    alice.close();
    bob.close();
  });

  await once(alice, 'connect');
  await once(bob, 'connect');

  await emitWithAck(alice, 'room:create', {
    roomId: 'AAAAAG',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAG',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAG',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const actionStatePromise = waitForState(
    alice,
    (payload) => payload.hand.actions.length === 1 && payload.hand.actions[0]?.timestamp === 42,
  );

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAG',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const actionAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'AAAAAG',
    playerId: 'p0',
    type: 'call',
    seq: 1
  });
  assert.deepEqual(actionAck, { ok: true });

  const actionState = await actionStatePromise;
  assert.equal(actionState.hand.actions.length, 1);
  assert.deepEqual(actionState.hand.actions[0], {
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    phase: 'betting_preflop',
    type: 'call',
    amount: 50,
    addedAmount: 50,
    toAmount: 100,
    stackBefore: 950,
    potTotalBefore: 150,
    sequenceNum: 1,
    timestamp: 42
  });
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
    roomId: 'AAAAAC',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAC',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAC',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const handEndStatePromise = waitForState(alice, (payload) => payload.hand.phase === 'hand_end', 1500);
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAC',
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
    roomId: 'AAAAAD',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAD',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAD',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAD',
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
    roomId: 'AAAAAD',
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
    roomId: 'AAAAAH',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAH',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAH',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAH',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const nextStatePromise = waitForState(
    alice,
    (payload) => payload.hand.phase === 'betting_preflop' && payload.hand.currentActorSeat === 1 && payload.hand.betting.currentBetToMatch === 200,
    1500
  );
  const betAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'AAAAAH',
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
    roomId: 'AAAAAG',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAG',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAG',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAG',
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
  const io = attachRealtime(app, { actionTimeoutMs: 40, waitingRoomReconnectGraceMs: 30 });

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
    roomId: 'AAAAAH',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAH',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAH',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAH',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const handEndStatePromise = waitForState(bob, (payload) => payload.hand.phase === 'hand_end', 1500);
  const postHandRoomStatePromise = waitForRoomState(
    bob,
    (payload) => payload.roomId === 'AAAAAH' && payload.playerCount === 1,
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
  assert.deepEqual(readyAck, { ok: true, roomId: 'AAAAAH', readyCount: 1, playerCount: 1 });

  const blockedByTableFinishedAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:start', {
    roomId: 'AAAAAH',
    buttonMarkerSeat: 1
  });
  assert.deepEqual(blockedByTableFinishedAck, { ok: false, error: 'table_finished' });

  const charlie = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => {
    charlie.close();
  });
  await once(charlie, 'connect');
  const playerCountTwoStatePromise = waitForRoomState(
    bob,
    (payload) => payload.roomId === 'AAAAAH' && payload.playerCount === 2,
    1500
  );
  await emitWithAck(charlie, 'room:join', {
    roomId: 'AAAAAH',
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
  assert.deepEqual(charlieReadyAck, { ok: true, roomId: 'AAAAAH', readyCount: 2, playerCount: 2 });

  const nextStartAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:start', {
    roomId: 'AAAAAH',
    buttonMarkerSeat: 1
  });
  assert.deepEqual(nextStartAck, { ok: true });
});

test('bots-only table is deleted once the last human disconnects and the hand ends', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, {
    actionTimeoutMs: 40,
    waitingRoomReconnectGraceMs: 30,
    botRuntime: { sleep: async () => {} }
  });

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const alice = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const prober = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    alice.close();
    prober.close();
  });

  await once(alice, 'connect');
  await once(prober, 'connect');

  await emitWithAck(alice, 'room:create', { roomId: 'AAAAAV', smallBlind: 10, bigBlind: 20 });
  await emitWithAck(alice, 'room:join', { roomId: 'AAAAAV', playerId: 'p0', playerName: 'Alice', seatIndex: 0, stack: 1000 });
  for (const seatIndex of [1, 2]) {
    await emitWithAck(alice, 'room:join', {
      roomId: 'AAAAAV',
      playerId: `bot-${seatIndex}`,
      playerName: `Fish Bot ${seatIndex}`,
      seatIndex,
      stack: 1000,
      isBot: true,
      botStrategy: 'fish'
    });
  }

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAV',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  alice.close();

  // Bots alone must not keep playing (and spending) forever: the room goes away at hand end.
  const deadline = Date.now() + 3000;
  let probeAck: { ok: boolean; error?: string } = { ok: true };
  while (Date.now() < deadline) {
    probeAck = await emitWithAck<{ ok: boolean; error?: string }>(prober, 'room:join', {
      roomId: 'AAAAAV',
      playerId: 'prober',
      playerName: 'Prober'
    });
    if (!probeAck.ok) {
      break;
    }
    await emitWithAck(prober, 'room:leave', {});
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.deepEqual(probeAck, { ok: false, error: 'room_not_found' });
});

test('game:start rotates button to the next stack-positive seat on the next hand', async (t) => {
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
    roomId: 'AAAAAW',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAW',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAW',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const firstHandStatePromise = waitForState(alice, (payload) => payload.roomId === 'AAAAAW' && payload.hand.handNumber === 1);
  const firstStartAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAW',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(firstStartAck, { ok: true });
  await firstHandStatePromise;

  const handEndStatePromise = waitForState(
    alice,
    (payload) => payload.roomId === 'AAAAAW' && payload.hand.phase === 'hand_end',
    1500
  );
  const foldAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'AAAAAW',
    playerId: 'p0',
    type: 'fold',
    seq: 1
  });
  assert.deepEqual(foldAck, { ok: true });
  await handEndStatePromise;

  const secondHandStatePromise = waitForState(
    alice,
    (payload) =>
      payload.roomId === 'AAAAAW'
      && payload.hand.handNumber === 2
      && payload.hand.buttonMarkerSeat === 1,
    1500
  );
  const secondStartAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:start', {
    roomId: 'AAAAAW'
  });
  assert.deepEqual(secondStartAck, { ok: true });

  const secondHandState = await secondHandStatePromise;
  assert.equal(secondHandState.hand.buttonMarkerSeat, 1);
  assert.equal(secondHandState.hand.sbSeat, 1);
  assert.equal(secondHandState.hand.bbSeat, 0);
  assert.equal(secondHandState.hand.currentActorSeat, 1);
});

test('eliminated human must explicitly spectate before bots-only auto-next resumes', async (t) => {
  const rng = sequenceRng(123);
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, {
    actionTimeoutMs: 40,
    botRuntime: {
      rng,
      sleep: async () => {},
      nowMs: () => 42,
    },
  });

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const human = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    human.close();
  });

  await once(human, 'connect');

  await emitWithAck(human, 'room:create', {
    roomId: 'AAAABY',
    smallBlind: 10,
    bigBlind: 20,
  });
  await emitWithAck(human, 'room:join', {
    roomId: 'AAAABY',
    playerId: 'human',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 10,
  });
  await emitWithAck(human, 'room:join', {
    roomId: 'AAAABY',
    playerId: 'bot-1',
    playerName: 'Bot 1',
    seatIndex: 1,
    stack: 1000,
    isBot: true,
    botStrategy: 'fish',
  });
  await emitWithAck(human, 'room:join', {
    roomId: 'AAAABY',
    playerId: 'bot-2',
    playerName: 'Bot 2',
    seatIndex: 2,
    stack: 1000,
    isBot: true,
    botStrategy: 'tag',
  });

  const handEndPromise = waitForHandResult(
    human,
    (payload) => payload.roomId === 'AAAABY' && payload.phase === 'hand_end',
    5_000,
  );
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(human, 'game:start', {
    roomId: 'AAAABY',
    buttonMarkerSeat: 2,
  });
  assert.deepEqual(startAck, { ok: true });

  const handEnd = await handEndPromise;
  assert.equal(handEnd.table.isBotsOnlyContinuation, true);
  assert.equal(handEnd.table.activeHumanStackPlayerCount, 0);

  let autoContinued = false;
  const observeUnexpectedNextHand = (payload: any) => {
    if (
      payload.roomId === 'AAAABY'
      && payload.hand.handNumber >= 2
      && payload.hand.phase !== 'hand_end'
    ) {
      autoContinued = true;
    }
  };
  human.on('game:state', observeUnexpectedNextHand);
  await sleep(1_900);
  human.off('game:state', observeUnexpectedNextHand);
  assert.equal(autoContinued, false);

  const spectateAck = await emitWithAck<{ ok: boolean; error?: string }>(human, 'game:spectate', {
    roomId: 'AAAABY',
  });
  assert.deepEqual(spectateAck, { ok: true });

  const nextHandState = await waitForState(
    human,
    (payload) =>
      payload.roomId === 'AAAABY'
      && payload.hand.handNumber >= 2
      && payload.hand.phase !== 'hand_end',
    5_000,
  );
  assert.equal(nextHandState.hand.handNumber >= 2, true);
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
    roomId: 'AAAAAM',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAM',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAM',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const aliceStatePromise = waitForState(alice, () => true);
  const bobStatePromise = waitForState(bob, () => true);
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAM',
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
    roomId: 'AAAAAL',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAL',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(outsider, 'game:start', {
    roomId: 'AAAAAL',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: false, error: 'not_room_member' });
});

test('game:start and game:action normalize lowercase room codes for room members', async (t) => {
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
    roomId: 'AAAABP',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAABP',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAABP',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'aaaabp',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const actionAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'aaaabp',
    playerId: 'p0',
    type: 'call',
    seq: 1
  });
  assert.deepEqual(actionAck, { ok: true });
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
    roomId: 'AAAAAN',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAN',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAN',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const firstStartAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAN',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(firstStartAck, { ok: true });

  const secondStartAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAN',
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
    roomId: 'AAAAAP',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAP',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAP',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAP',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const firstActionAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'AAAAAP',
    playerId: 'p0',
    type: 'call',
    seq: 1
  });
  assert.deepEqual(firstActionAck, { ok: true });

  const duplicateAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'AAAAAP',
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
    roomId: 'AAAAAQ',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(alice, 'room:join', {
    roomId: 'AAAAAQ',
    playerId: 'p0',
    playerName: 'Alice',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(bob, 'room:join', {
    roomId: 'AAAAAQ',
    playerId: 'p1',
    playerName: 'Bob',
    seatIndex: 1,
    stack: 1000
  });

  const startStatePromise = waitForState(alice, (payload) => payload.roomId === 'AAAAAQ');
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:start', {
    roomId: 'AAAAAQ',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });

  const startState = await startStatePromise;
  assert.equal(typeof startState.stateVersion, 'number');

  const staleExpectedVersion = startState.stateVersion;
  const advancedStatePromise = waitForState(
    alice,
    (payload) => payload.roomId === 'AAAAAQ' && payload.stateVersion > staleExpectedVersion && payload.hand.currentActorSeat === 1
  );
  const actionAck = await emitWithAck<{ ok: boolean; error?: string }>(alice, 'game:action', {
    roomId: 'AAAAAQ',
    playerId: 'p0',
    type: 'call',
    seq: 1,
    expectedVersion: staleExpectedVersion
  });
  assert.deepEqual(actionAck, { ok: true });

  await advancedStatePromise;

  const staleVersionAck = await emitWithAck<{ ok: boolean; error?: string }>(bob, 'game:action', {
    roomId: 'AAAAAQ',
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
    roomId: 'AAAAAK',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(human, 'room:join', {
    roomId: 'AAAAAK',
    playerId: 'human-1',
    playerName: 'Human',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(human, 'room:join', {
    roomId: 'AAAAAK',
    playerId: 'bot-1',
    playerName: 'Bot',
    seatIndex: 1,
    stack: 1000,
    isBot: true
  });

  const startState = waitForState(human, () => true);
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(human, 'game:start', {
    roomId: 'AAAAAK',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });
  await startState;

  // Real bot pacing: if the bot checks preflop it also opens the flop, so the human waits two thinking
  // delays (up to 2.1s each) plus the new-street pause (1.8s), about 6s before CPU time.
  const handProgressAfterBotActions = waitForState(
    human,
    (payload) =>
      payload.hand.actions.length >= 2 && (payload.hand.currentActorSeat === 0 || payload.hand.phase === 'hand_end'),
    10_000
  );
  const actionAck = await emitWithAck<{ ok: boolean; error?: string }>(human, 'game:action', {
    roomId: 'AAAAAK',
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

test('injected bot runtime makes bot turns deterministic and immediate', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, {
    botRuntime: {
      rng: () => 0.99,
      sleep: async () => {},
      nowMs: () => 42
    }
  } as any);

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
    roomId: 'AAAAAY',
    smallBlind: 50,
    bigBlind: 100
  });
  await emitWithAck(human, 'room:join', {
    roomId: 'AAAAAY',
    playerId: 'human-1',
    playerName: 'Human',
    seatIndex: 0,
    stack: 1000
  });
  await emitWithAck(human, 'room:join', {
    roomId: 'AAAAAY',
    playerId: 'bot-1',
    playerName: 'Bot',
    seatIndex: 1,
    stack: 1000,
    isBot: true
  });

  const startState = waitForState(human, (payload) => payload.roomId === 'AAAAAY' && payload.hand.handNumber === 1);
  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(human, 'game:start', {
    roomId: 'AAAAAY',
    buttonMarkerSeat: 0
  });
  assert.deepEqual(startAck, { ok: true });
  await startState;

  const handProgressAfterBotActions = waitForState(
    human,
    (payload) =>
      payload.roomId === 'AAAAAY'
      && payload.hand.actions.length >= 2
      && (payload.hand.currentActorSeat === 0 || payload.hand.phase === 'hand_end'),
    250
  );
  const actionAck = await emitWithAck<{ ok: boolean; error?: string }>(human, 'game:action', {
    roomId: 'AAAAAY',
    playerId: 'human-1',
    type: 'call',
    seq: 1
  });

  assert.deepEqual(actionAck, { ok: true });
  const advanced = await handProgressAfterBotActions;
  assert.ok(advanced.hand.actions.length >= 2);
  assert.equal(advanced.hand.actions[1]?.playerId, 'bot-1');
});

async function startWaitingRoomServer(t: { after: (fn: () => unknown) => void }, waitingRoomReconnectGraceMs: number) {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, { waitingRoomReconnectGraceMs });
  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

test('a waiting-room player who reconnects within the grace period keeps the room and seat', async (t) => {
  const url = await startWaitingRoomServer(t, 5_000);
  const first = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  await once(first, 'connect');
  await emitWithAck(first, 'room:create', { roomId: 'AAAAGR', smallBlind: 10, bigBlind: 20 });
  await emitWithAck(first, 'room:join', { roomId: 'AAAAGR', playerId: 'p0', playerName: 'Alice', seatIndex: 0, stack: 1000 });

  first.close();
  await sleep(50);

  const second = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => second.close());
  await once(second, 'connect');
  const rejoin = await emitWithAck<{ ok: boolean; playerCount?: number; error?: string }>(second, 'room:join', {
    roomId: 'AAAAGR',
    playerId: 'p0',
    playerName: 'Alice',
    stack: 1000
  });
  assert.deepEqual(rejoin, { ok: true, roomId: 'AAAAGR', playerCount: 1 });
});

test('a waiting-room player who stays away past the grace period is removed with the empty room', async (t) => {
  const url = await startWaitingRoomServer(t, 30);
  const first = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  await once(first, 'connect');
  await emitWithAck(first, 'room:create', { roomId: 'AAAAGS', smallBlind: 10, bigBlind: 20 });
  await emitWithAck(first, 'room:join', { roomId: 'AAAAGS', playerId: 'p0', playerName: 'Alice', seatIndex: 0, stack: 1000 });

  first.close();
  await sleep(200);

  const second = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => second.close());
  await once(second, 'connect');
  const rejoin = await emitWithAck<{ ok: boolean; error?: string }>(second, 'room:join', {
    roomId: 'AAAAGS',
    playerId: 'p0',
    playerName: 'Alice',
    stack: 1000
  });
  assert.deepEqual(rejoin, { ok: false, error: 'room_not_found' });
});

async function seatHeadsUpPair(
  t: { after: (fn: () => unknown) => void },
  options: { roomId: string; actionTimeoutMs?: number; beforeStart?: (alice: ReturnType<typeof createClient>, bob: ReturnType<typeof createClient>) => void }
) {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, { waitingRoomReconnectGraceMs: 5_000, actionTimeoutMs: options.actionTimeoutMs });
  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  const alice = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const bob = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => {
    alice.close();
    bob.close();
  });
  await once(alice, 'connect');
  await once(bob, 'connect');
  await emitWithAck(alice, 'room:create', { roomId: options.roomId, smallBlind: 10, bigBlind: 20 });
  await emitWithAck(alice, 'room:join', { roomId: options.roomId, playerId: 'p0', playerName: 'Alice', seatIndex: 0, stack: 1000 });
  await emitWithAck(bob, 'room:join', { roomId: options.roomId, playerId: 'p1', playerName: 'Bob', seatIndex: 1, stack: 1000 });
  options.beforeStart?.(alice, bob);
  const startAck = await emitWithAck(alice, 'game:start', { roomId: options.roomId, buttonMarkerSeat: 0 });
  assert.deepEqual(startAck, { ok: true });
  return { url, alice, bob };
}

async function rejoinAsAlice(t: { after: (fn: () => unknown) => void }, url: string, roomId: string) {
  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => socket.close());
  await once(socket, 'connect');
  const roomState = waitForRoomState(socket, (payload) => payload.roomId === roomId);
  const ack = await emitWithAck(socket, 'room:join', { roomId, playerId: 'p0', playerName: 'Alice', stack: 1000 });
  assert.deepEqual(ack, { ok: true, roomId, playerCount: 2 });
  return roomState;
}

test('a player who refreshes between hands keeps their seat, stack, and host role', async (t) => {
  const { url, alice, bob } = await seatHeadsUpPair(t, { roomId: 'AAAAGT' });
  const handEnd = waitForState(bob, (payload) => payload.hand.phase === 'hand_end');
  await emitWithAck(alice, 'game:action', { roomId: 'AAAAGT', playerId: 'p0', type: 'fold', seq: 1 });
  await handEnd;

  alice.close();
  await sleep(50);

  const roomState = await rejoinAsAlice(t, url, 'AAAAGT');
  assert.equal(roomState.players.find((player: { id: string }) => player.id === 'p0')?.stack, 990);
  assert.equal(roomState.hostPlayerId, 'p0');
});

test('a player whose hand ends while they are refreshing keeps their seat', async (t) => {
  const { url, alice, bob } = await seatHeadsUpPair(t, { roomId: 'AAAAGU', actionTimeoutMs: 40 });
  const handEnd = waitForState(bob, (payload) => payload.hand.phase === 'hand_end');

  // Alice is first to act; she drops and the action timer folds her hand before she is back.
  alice.close();
  await handEnd;
  await sleep(50);

  const roomState = await rejoinAsAlice(t, url, 'AAAAGU');
  assert.equal(roomState.players.find((player: { id: string }) => player.id === 'p0')?.stack, 990);
});

test('game:coach goes only to the actor, after action_required, and a second socket for that player gets the same advice', async (t) => {
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
  const aliceAgain = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  t.after(() => {
    alice.close();
    bob.close();
    aliceAgain.close();
  });

  await once(alice, 'connect');
  await once(bob, 'connect');
  await once(aliceAgain, 'connect');

  await emitWithAck(alice, 'room:create', { roomId: 'CQACHA', smallBlind: 10, bigBlind: 20 });
  await emitWithAck(alice, 'room:join', { roomId: 'CQACHA', playerId: 'p0', playerName: 'Alice', seatIndex: 0, stack: 1000 });
  await emitWithAck(bob, 'room:join', { roomId: 'CQACHA', playerId: 'p1', playerName: 'Bob', seatIndex: 1, stack: 1000 });

  const aliceEvents: string[] = [];
  alice.on('game:action_required', () => aliceEvents.push('action_required'));
  alice.on('game:coach', () => aliceEvents.push('coach'));
  let bobCoachCount = 0;
  bob.on('game:coach', () => {
    bobCoachCount += 1;
  });

  const aliceCoach = new Promise<any>((resolve) => alice.once('game:coach', resolve));
  const startAck = await emitWithAck<{ ok: boolean }>(alice, 'game:start', { roomId: 'CQACHA', buttonMarkerSeat: 0 });
  assert.deepEqual(startAck, { ok: true });

  const coach = await aliceCoach;
  assert.deepEqual(aliceEvents, ['action_required', 'coach']);
  assert.equal(coach.roomId, 'CQACHA');
  assert.equal(coach.playerId, 'p0');
  assert.equal(coach.advice.street, 'preflop');
  assert.equal(coach.advice.stateVersion, coach.stateVersion);
  assert.equal(coach.advice.spot.holeCards.length, 2);
  assert.ok(coach.advice.options.length > 0);

  const secondSocketCoach = new Promise<any>((resolve) => aliceAgain.once('game:coach', resolve));
  await emitWithAck(aliceAgain, 'room:join', { roomId: 'CQACHA', playerId: 'p0', playerName: 'Alice', seatIndex: 0, stack: 1000 });
  assert.deepEqual(await secondSocketCoach, coach);

  await sleep(100);
  assert.equal(bobCoachCount, 0);
});

test('game:review goes only to each player’s own sockets at hand end, with the advice they were sent, and a reconnect gets it again', async (t) => {
  const aliceReviews: any[] = [];
  const bobReviews: any[] = [];
  let aliceCoach!: Promise<any>;
  const { url, alice, bob } = await seatHeadsUpPair(t, {
    roomId: 'REVWAB',
    beforeStart: (alice, bob) => {
      alice.on('game:review', (review) => aliceReviews.push(review));
      bob.on('game:review', (review) => bobReviews.push(review));
      aliceCoach = new Promise((resolve) => alice.once('game:coach', resolve));
    },
  });

  // Alice (button, first to act heads-up) raises once her advice is in; Bob folds.
  const { advice } = await aliceCoach;
  const bobTurn = waitForActionRequired(bob, (payload) => payload.playerId === 'p1');
  assert.deepEqual(await emitWithAck(alice, 'game:action', { roomId: 'REVWAB', type: 'raise_to', amount: 60, seq: 1 }), { ok: true });
  await bobTurn;
  const handEnd = waitForState(alice, (payload) => payload.hand.phase === 'hand_end');
  assert.deepEqual(await emitWithAck(bob, 'game:action', { roomId: 'REVWAB', type: 'fold', seq: 1 }), { ok: true });
  await handEnd;
  await sleep(50);

  assert.equal(aliceReviews.length, 1);
  assert.equal(bobReviews.length, 1);
  const [review] = aliceReviews;
  assert.equal(review.playerId, 'p0');
  assert.equal(review.handNumber, 1);
  assert.equal(review.decisions.length, 1);
  assert.equal(review.decisions[0].street, 'preflop');
  assert.deepEqual(review.decisions[0].heroAction, { kind: 'raise', to: 60, source: 'player' });
  assert.deepEqual(review.decisions[0].advice, advice);
  assert.deepEqual(review.session, { matched: 0, close: 0, off: 0, [review.decisions[0].verdict]: 1 });
  assert.equal(bobReviews[0].playerId, 'p1');
  assert.deepEqual(bobReviews[0].decisions.map((decision: any) => decision.heroAction), [{ kind: 'fold', source: 'player' }]);

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => socket.close());
  await once(socket, 'connect');
  const replayed = new Promise<any>((resolve) => socket.once('game:review', resolve));
  await emitWithAck(socket, 'room:join', { roomId: 'REVWAB', playerId: 'p0', playerName: 'Alice', stack: 1000 });
  assert.deepEqual(await replayed, review);
});

test('a timed-out decision is reviewed and flagged as a timeout', async (t) => {
  let reviewed!: Promise<any>;
  await seatHeadsUpPair(t, {
    roomId: 'REVWAC',
    actionTimeoutMs: 40,
    beforeStart: (alice) => {
      reviewed = new Promise((resolve) => alice.once('game:review', resolve));
    },
  });
  const review = await reviewed;
  assert.equal(review.playerId, 'p0');
  assert.deepEqual(review.decisions.map((decision: any) => decision.heroAction), [{ kind: 'fold', source: 'timeout' }]);
});

test('a reconnect in the next hand, before the player acts, gets the last hand’s review', async (t) => {
  let firstReview!: Promise<any>;
  const { url, alice } = await seatHeadsUpPair(t, {
    roomId: 'REVWAD',
    beforeStart: (alice) => {
      firstReview = new Promise((resolve) => alice.once('game:review', resolve));
    },
  });
  assert.deepEqual(await emitWithAck(alice, 'game:action', { roomId: 'REVWAD', type: 'fold', seq: 1 }), { ok: true });
  const review = await firstReview;
  assert.equal(review.handNumber, 1);

  // Hand 2: Bob has the button and acts first, so Alice has not decided yet.
  const handTwo = waitForState(alice, (payload) => payload.hand.handNumber === 2);
  assert.deepEqual(await emitWithAck(alice, 'game:start', { roomId: 'REVWAD' }), { ok: true });
  await handTwo;

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => socket.close());
  await once(socket, 'connect');
  const replayed = new Promise<any>((resolve) => socket.once('game:review', resolve));
  await emitWithAck(socket, 'room:join', { roomId: 'REVWAD', playerId: 'p0', playerName: 'Alice', stack: 1000 });
  assert.deepEqual(await Promise.race([replayed, sleep(500).then(() => 'no review')]), review);
});

test('a player seated mid-hand, who is not in it, gets no review of the others’ decisions', async (t) => {
  const carolReviews: any[] = [];
  const { url, alice } = await seatHeadsUpPair(t, { roomId: 'REVWAE' });
  const carol = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => carol.close());
  await once(carol, 'connect');
  carol.on('game:review', (review) => carolReviews.push(review));
  await emitWithAck(carol, 'room:join', { roomId: 'REVWAE', playerId: 'p2', playerName: 'Carol', seatIndex: 2, stack: 1000 });

  const handEnd = waitForState(carol, (payload) => payload.hand.phase === 'hand_end');
  assert.deepEqual(await emitWithAck(alice, 'game:action', { roomId: 'REVWAE', type: 'fold', seq: 1 }), { ok: true });
  await handEnd;
  await sleep(100);
  assert.deepEqual(carolReviews, []);
});

test('a reconnect two hands after the review is not sent it', async (t) => {
  let firstReview!: Promise<any>;
  const { url, alice, bob } = await seatHeadsUpPair(t, {
    roomId: 'REVWAF',
    beforeStart: (alice) => {
      firstReview = new Promise((resolve) => alice.once('game:review', resolve));
    },
  });
  assert.deepEqual(await emitWithAck(alice, 'game:action', { roomId: 'REVWAF', type: 'fold', seq: 1 }), { ok: true });
  assert.equal((await firstReview).handNumber, 1);

  // Hand 2: Bob has the button and folds, so Alice never decides. Hand 3 is left open.
  const handTwoEnd = waitForState(alice, (payload) => payload.hand.handNumber === 2 && payload.hand.phase === 'hand_end');
  await emitWithAck(alice, 'game:start', { roomId: 'REVWAF' });
  assert.deepEqual(await emitWithAck(bob, 'game:action', { roomId: 'REVWAF', type: 'fold', seq: 1 }), { ok: true });
  await handTwoEnd;
  const handThree = waitForState(alice, (payload) => payload.hand.handNumber === 3);
  await emitWithAck(alice, 'game:start', { roomId: 'REVWAF' });
  await handThree;

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => socket.close());
  await once(socket, 'connect');
  const reviews: any[] = [];
  socket.on('game:review', (review) => reviews.push(review));
  await emitWithAck(socket, 'room:join', { roomId: 'REVWAF', playerId: 'p0', playerName: 'Alice', stack: 1000 });
  await sleep(200);
  assert.deepEqual(reviews, []);
});

test('a player who left the room does not get their old review back when they join again', async (t) => {
  let firstReview!: Promise<any>;
  const { url, alice } = await seatHeadsUpPair(t, {
    roomId: 'REVWAG',
    beforeStart: (alice) => {
      firstReview = new Promise((resolve) => alice.once('game:review', resolve));
    },
  });
  assert.deepEqual(await emitWithAck(alice, 'game:action', { roomId: 'REVWAG', type: 'fold', seq: 1 }), { ok: true });
  await firstReview;
  assert.equal((await emitWithAck<{ ok: boolean }>(alice, 'room:leave', {})).ok, true);

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(() => socket.close());
  await once(socket, 'connect');
  const reviews: any[] = [];
  socket.on('game:review', (review) => reviews.push(review));
  await emitWithAck(socket, 'room:join', { roomId: 'REVWAG', playerId: 'p0', playerName: 'Alice', stack: 1000 });
  await sleep(200);
  assert.deepEqual(reviews, []);
});
