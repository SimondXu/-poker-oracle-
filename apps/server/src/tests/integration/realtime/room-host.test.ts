import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { io as createClient } from 'socket.io-client';

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

function waitForEvent(socket: Client, event: string, predicate: (payload: any) => boolean, timeoutMs = 2000): Promise<any> {
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

async function startRealtime(t: TestContext) {
  const app = createServer({ nowMs: () => 42 });
  // rng 0 makes the random first-hand button deterministic: the lowest stack-positive seat.
  const io = attachRealtime(app, { botRuntime: { sleep: async () => {}, rng: () => 0 } });
  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  return async (): Promise<Client> => {
    const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    t.after(() => {
      socket.close();
    });
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    return socket;
  };
}

async function seatHostAndGuest(connect: () => Promise<Client>, roomId: string) {
  const host = await connect();
  const guest = await connect();
  await emitWithAck(host, 'room:create', { roomId, smallBlind: 10, bigBlind: 20 });
  await emitWithAck(host, 'room:join', { roomId, playerId: 'host', playerName: 'Host', seatIndex: 0 });
  await emitWithAck(guest, 'room:join', { roomId, playerId: 'guest', playerName: 'Guest', seatIndex: 1 });
  return { host, guest };
}

test('the first human to sit is the host and room:state says so', async (t) => {
  const connect = await startRealtime(t);
  const host = await connect();
  await emitWithAck(host, 'room:create', { roomId: 'HSTAAA', smallBlind: 10, bigBlind: 20 });
  await emitWithAck(host, 'room:join', { roomId: 'HSTAAA', playerId: 'host', playerName: 'Host' });

  const guest = await connect();
  const statePromise = waitForEvent(guest, 'room:state', (state) => state.playerCount === 2);
  await emitWithAck(guest, 'room:join', { roomId: 'HSTAAA', playerId: 'guest', playerName: 'Guest' });

  assert.equal((await statePromise).hostPlayerId, 'host');
});

test('only the host can remove a bot', async (t) => {
  const connect = await startRealtime(t);
  const { host, guest } = await seatHostAndGuest(connect, 'HSTAAB');
  await emitWithAck(guest, 'room:join', {
    roomId: 'HSTAAB', playerId: 'bot-a', playerName: 'Bot A', seatIndex: 2, isBot: true, botStrategy: 'fish',
  });

  const guestRemove = await emitWithAck(guest, 'room:remove_player', { roomId: 'HSTAAB', playerId: 'bot-a' });
  assert.deepEqual(guestRemove, { ok: false, error: 'not_room_host' });

  const hostRemove = await emitWithAck(host, 'room:remove_player', { roomId: 'HSTAAB', playerId: 'bot-a' });
  assert.deepEqual(hostRemove, { ok: true });
});

test('hosting passes to the next human when the host leaves', async (t) => {
  const connect = await startRealtime(t);
  const { host, guest } = await seatHostAndGuest(connect, 'HSTAAC');

  const statePromise = waitForEvent(guest, 'room:state', (state) => state.playerCount === 1);
  await emitWithAck(host, 'room:leave', {});

  assert.equal((await statePromise).hostPlayerId, 'guest');
});

test('a non-host cannot choose the first-hand button seat', async (t) => {
  const connect = await startRealtime(t);
  const { guest } = await seatHostAndGuest(connect, 'HSTAAD');

  const statePromise = waitForEvent(guest, 'game:state', (state) => state.hand?.handNumber === 1);
  const startAck = await emitWithAck(guest, 'game:start', { roomId: 'HSTAAD', buttonMarkerSeat: 1 });
  assert.deepEqual(startAck, { ok: true });

  assert.equal((await statePromise).hand.buttonMarkerSeat, 0, 'the request is ignored and the random pick (seat 0) is used');
});

test('the host can choose the first-hand button seat', async (t) => {
  const connect = await startRealtime(t);
  const { host } = await seatHostAndGuest(connect, 'HSTAAE');

  const statePromise = waitForEvent(host, 'game:state', (state) => state.hand?.handNumber === 1);
  const startAck = await emitWithAck(host, 'game:start', { roomId: 'HSTAAE', buttonMarkerSeat: 1 });
  assert.deepEqual(startAck, { ok: true });

  assert.equal((await statePromise).hand.buttonMarkerSeat, 1);
});
