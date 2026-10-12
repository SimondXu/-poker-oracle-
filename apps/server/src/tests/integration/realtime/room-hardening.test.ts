import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { io as createClient } from 'socket.io-client';

import { createSessionRevocations } from '../../../auth/session-revocations.ts';
import { createServer } from '../../../index.ts';
import { attachRealtime } from '../../../realtime.ts';

type Client = ReturnType<typeof createClient>;
type Ack = { ok: boolean; error?: string; [key: string]: unknown };

function emitWithAck<T = Ack>(socket: Client, event: string, payload: unknown, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting ack for ${event}`)), timeoutMs);
    socket.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

function waitForEvent(socket: Client, event: string, predicate: (payload: any) => boolean, timeoutMs = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (payload: any) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    };
    socket.on(event, onEvent);
  });
}

async function startRealtime(t: TestContext, options: Parameters<typeof attachRealtime>[1] = {}) {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, {
    botRuntime: { sleep: async () => {} },
    ...options,
  });
  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  const connect = async (): Promise<Client> => {
    const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    t.after(() => {
      socket.close();
    });
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    return socket;
  };

  return { connect };
}

test('a non-function ack argument does not crash the server', async (t) => {
  const { connect } = await startRealtime(t);
  const socket = await connect();

  socket.emit('room:leave', {}, 'garbage');
  socket.emit('room:join', { roomId: 'HRDAAA' }, 'garbage');
  socket.emit('room:create', { roomId: 'HRDAAA', smallBlind: 1, bigBlind: 2 }, 42);

  const createAck = await emitWithAck(socket, 'room:create', { roomId: 'HRDAAB', smallBlind: 1, bigBlind: 2 });
  assert.equal(createAck.ok, true);
});

test('room:join rejects adding a bot from a socket that is not a member of the room', async (t) => {
  const { connect } = await startRealtime(t);
  const host = await connect();
  const outsider = await connect();

  await emitWithAck(host, 'room:create', { roomId: 'HRDAAC', smallBlind: 10, bigBlind: 20 });
  await emitWithAck(host, 'room:join', { roomId: 'HRDAAC', playerId: 'host', playerName: 'Host' });

  const botAck = await emitWithAck(outsider, 'room:join', {
    roomId: 'HRDAAC',
    playerId: 'bot-x',
    playerName: 'Bot X',
    isBot: true,
    botStrategy: 'tag',
  });
  assert.deepEqual(botAck, { ok: false, error: 'not_room_member' });
});

test('room:join rejects a bot join that targets an existing human seat', async (t) => {
  const { connect } = await startRealtime(t);
  const host = await connect();

  await emitWithAck(host, 'room:create', { roomId: 'HRDAAD', smallBlind: 10, bigBlind: 20 });
  await emitWithAck(host, 'room:join', { roomId: 'HRDAAD', playerId: 'host', playerName: 'Host' });

  const botAck = await emitWithAck(host, 'room:join', {
    roomId: 'HRDAAD',
    playerId: 'host',
    playerName: 'Hijack',
    isBot: true,
    botStrategy: 'tag',
  });
  assert.deepEqual(botAck, { ok: false, error: 'invalid_payload' });
});

test('room:join rejects oversized stacks, names and seat indexes', async (t) => {
  const { connect } = await startRealtime(t);
  const host = await connect();
  await emitWithAck(host, 'room:create', { roomId: 'HRDAAE', smallBlind: 10, bigBlind: 20 });

  const hugeStack = await emitWithAck(host, 'room:join', {
    roomId: 'HRDAAE', playerId: 'p0', playerName: 'Alice', stack: 1e12,
  });
  assert.deepEqual(hugeStack, { ok: false, error: 'invalid_payload' });

  const longName = await emitWithAck(host, 'room:join', {
    roomId: 'HRDAAE', playerId: 'p0', playerName: 'x'.repeat(200),
  });
  assert.deepEqual(longName, { ok: false, error: 'invalid_payload' });

  const farSeat = await emitWithAck(host, 'room:join', {
    roomId: 'HRDAAE', playerId: 'p0', playerName: 'Alice', seatIndex: 9999,
  });
  assert.deepEqual(farSeat, { ok: false, error: 'invalid_payload' });
});

test('room:join rejects players beyond the table capacity', async (t) => {
  const { connect } = await startRealtime(t);
  const host = await connect();
  await emitWithAck(host, 'room:create', { roomId: 'HRDAAF', smallBlind: 10, bigBlind: 20 });
  await emitWithAck(host, 'room:join', { roomId: 'HRDAAF', playerId: 'host', playerName: 'Host' });

  for (let index = 0; index < 8; index += 1) {
    const ack = await emitWithAck(host, 'room:join', {
      roomId: 'HRDAAF', playerId: `bot-${index}`, playerName: `Bot ${index}`, isBot: true, botStrategy: 'fish',
    });
    assert.equal(ack.ok, true, `bot ${index} should fit`);
  }

  const overflow = await emitWithAck(host, 'room:join', {
    roomId: 'HRDAAF', playerId: 'bot-overflow', playerName: 'Bot Overflow', isBot: true, botStrategy: 'fish',
  });
  assert.deepEqual(overflow, { ok: false, error: 'room_full' });
});

test('a room with only bots left is deleted when the last human leaves', async (t) => {
  const { connect } = await startRealtime(t);
  const host = await connect();
  await emitWithAck(host, 'room:create', { roomId: 'HRDAAG', smallBlind: 10, bigBlind: 20 });
  await emitWithAck(host, 'room:join', { roomId: 'HRDAAG', playerId: 'host', playerName: 'Host' });
  await emitWithAck(host, 'room:join', {
    roomId: 'HRDAAG', playerId: 'bot-a', playerName: 'Bot A', isBot: true, botStrategy: 'fish',
  });

  const leaveAck = await emitWithAck(host, 'room:leave', {});
  assert.equal(leaveAck.ok, true);

  const rejoin = await emitWithAck(host, 'room:join', { roomId: 'HRDAAG', playerId: 'host', playerName: 'Host' });
  assert.deepEqual(rejoin, { ok: false, error: 'room_not_found' });
});

test('hand_end does not reveal hole cards of players who folded or of an uncontested winner', async (t) => {
  const { connect } = await startRealtime(t);
  const alice = await connect();
  const bob = await connect();
  await emitWithAck(alice, 'room:create', { roomId: 'HRDAAH', smallBlind: 10, bigBlind: 20 });
  await emitWithAck(alice, 'room:join', { roomId: 'HRDAAH', playerId: 'alice', playerName: 'Alice', seatIndex: 0 });
  await emitWithAck(bob, 'room:join', { roomId: 'HRDAAH', playerId: 'bob', playerName: 'Bob', seatIndex: 1 });

  const started = waitForEvent(alice, 'game:state', (state) => state.hand?.phase === 'betting_preflop');
  await emitWithAck(alice, 'game:start', { roomId: 'HRDAAH', buttonMarkerSeat: 0 });
  const preflop = (await started).hand;
  const actorSocket = preflop.currentActorSeat === 0 ? alice : bob;
  const observer = actorSocket === alice ? bob : alice;
  const observerId = observer === alice ? 'alice' : 'bob';

  const ended = waitForEvent(observer, 'game:state', (state) => state.hand?.phase === 'hand_end');
  const foldAck = await emitWithAck(actorSocket, 'game:action', { roomId: 'HRDAAH', type: 'fold', seq: 1 });
  assert.equal(foldAck.ok, true);
  const endState = (await ended).hand;

  for (const player of endState.players) {
    if (player.id === observerId) {
      assert.equal(player.holeCards.length, 2, 'own cards stay visible');
    } else {
      assert.deepEqual(player.holeCards, [], `folded player ${player.id} cards must stay hidden`);
    }
  }
});

test('a socket presenting a logged-out session cookie is treated as unauthenticated', async (t) => {
  const sessionRevocations = createSessionRevocations();
  const app = createServer({ nowMs: () => 42, sessionRevocations });
  const io = attachRealtime(app, { authStrict: true, nowMs: () => 42, sessionRevocations });
  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  const login = await fetch(`${url}/api/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'Alice' }),
  });
  const cookie = (login.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? '';
  await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: { cookie } });

  const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { Cookie: cookie } });
  t.after(() => {
    socket.close();
  });
  await new Promise<void>((resolve) => socket.once('connect', () => resolve()));

  const createAck = await emitWithAck(socket, 'room:create', { roomId: 'HRDAAJ', smallBlind: 10, bigBlind: 20 });
  assert.deepEqual(createAck, { ok: false, error: 'unauthorized' });
});
