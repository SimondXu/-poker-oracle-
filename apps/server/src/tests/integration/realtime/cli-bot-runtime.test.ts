import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { io as createClient } from 'socket.io-client';

import { createServer } from '../../../index.ts';
import { createCliBotRuntime, type CliBotRuntime } from '../../../game-loop/cli-bot-runtime.ts';
import type { RuntimeRoom } from '../../../rooms/types.ts';
import { attachRealtime } from '../../../realtime.ts';
import type { RunFn, RunResult } from '../../../tools/claude-cli.ts';

type Client = ReturnType<typeof createClient>;

const ROOM = 'CLUBK2';
const HAIKU = 'claude-cli:claude-haiku-5-5';

const result = (stdout: string, extra: Partial<RunResult> = {}): RunResult => ({ stdout, stderr: '', exitCode: 0, timedOut: false, ms: 5, ...extra });
const answer = (choice: string) => result(JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 2,
  structured_output: { choice, talk: null, note: null },
  modelUsage: { 'claude-haiku-5-5': { inputTokens: 100, outputTokens: 10 } },
  permission_denials: [],
}));
const usageLimit = () => result(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, api_error_status: 429, result: "You've hit your limit · resets 3pm" }));

function emitWithAck<T>(socket: Client, event: string, payload: unknown, timeoutMs = 2_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting ack for ${event}`)), timeoutMs);
    socket.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for a condition');
    }
    await sleep(10);
  }
}

async function setup(cliBots: CliBotRuntime | undefined) {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, {
    ...(cliBots ? { cliBots } : {}),
    botRuntime: { sleep: async () => {}, nowMs: () => 42 },
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const human = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  await once(human, 'connect');

  const roomStates: any[] = [];
  const statuses: any[] = [];
  const humanTurns: any[] = [];
  const botActions: string[] = [];
  human.on('room:state', (payload) => roomStates.push(payload));
  human.on('game:bot_status', (payload) => statuses.push(payload));
  human.on('game:action_required', (payload) => humanTurns.push(payload));
  human.on('game:event', (payload) => {
    if (payload.action.playerId === 'bot-claude-1') {
      botActions.push(payload.action.type);
    }
  });

  await emitWithAck(human, 'room:create', { roomId: ROOM, smallBlind: 50, bigBlind: 100 });
  await emitWithAck(human, 'room:join', { roomId: ROOM, playerId: 'human-1', playerName: 'Human', seatIndex: 0, stack: 1_000 });

  return {
    human,
    roomStates,
    statuses,
    humanTurns,
    botActions,
    addBot: (botModel: string | undefined, botStrategy?: string) =>
      emitWithAck<{ ok: boolean; error?: string }>(human, 'room:join', {
        roomId: ROOM,
        playerId: botModel ? 'bot-claude-1' : 'bot-tag-1',
        playerName: 'Bot',
        seatIndex: 1,
        stack: 1_000,
        isBot: true,
        ...(botModel ? { botModel } : {}),
        ...(botStrategy ? { botStrategy } : {}),
      }),
    start: () => emitWithAck<{ ok: boolean; error?: string }>(human, 'game:start', { roomId: ROOM, buttonMarkerSeat: 1 }),
    async cleanup() {
      human.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await app.close();
    },
  };
}

test('flag off: the Claude options are not offered, a request for one is refused, and rule bots are unchanged', async (t) => {
  const table = await setup(undefined);
  t.after(table.cleanup);

  await waitFor(() => table.roomStates.length > 0);
  assert.ok(table.roomStates.every((state) => !('cliBots' in state)));
  assert.deepEqual(await table.addBot(HAIKU), { ok: false, error: 'cli_bots_disabled' });
  assert.deepEqual(await table.addBot(undefined, 'tag'), { ok: true, roomId: ROOM, playerCount: 2 });
  await waitFor(() => table.roomStates.some((state) => state.playerCount === 2));
  const last = table.roomStates.at(-1);
  assert.ok(!('cliBots' in last));
  assert.deepEqual(last.players.map((player: any) => [player.botStrategy, 'botModel' in player]), [[null, false], ['tag', false]]);
});

test('flag on: the room state offers them, the seat names the model, and the bot plays the letter the model chose while the human waits', async (t) => {
  const gate = Promise.withResolvers<RunResult>();
  const calls: string[][] = [];
  const run: RunFn = async (args) => {
    calls.push(args);
    return gate.promise;
  };
  const rooms: RuntimeRoom[] = [];
  const base = createCliBotRuntime({ timeoutMs: 30_000, run, log: () => undefined });
  const cliBots: CliBotRuntime = {
    get enabled() {
      return base.enabled;
    },
    timeoutMs: base.timeoutMs,
    decide: base.decide,
    ledgerOf: base.ledgerOf,
    recordHandEnd: (room) => {
      rooms.push(room);
      base.recordHandEnd(room);
    },
  };
  const table = await setup(cliBots);
  t.after(table.cleanup);

  await waitFor(() => table.roomStates.length > 0);
  assert.ok(table.roomStates.every((state) => state.cliBots === true));
  assert.deepEqual(await table.addBot(HAIKU), { ok: true, roomId: ROOM, playerCount: 2 });
  await waitFor(() => table.roomStates.some((state) => state.playerCount === 2));
  const seat = table.roomStates.at(-1).players.find((player: any) => player.isBot);
  assert.equal(seat.botModel, HAIKU);
  assert.equal(seat.botStrategy, null);

  assert.deepEqual(await table.start(), { ok: true });
  await waitFor(() => table.statuses.some((status) => status.status === 'thinking'));
  await sleep(100);
  assert.equal(table.humanTurns.length, 0, 'the human is not asked, and no clock runs for them, while the bot thinks');
  assert.equal(calls.length, 1);

  // B is the call that completes the small blind; the human then has the option.
  gate.resolve(answer('B'));
  await waitFor(() => table.humanTurns.length === 1);
  assert.deepEqual(table.botActions, ['call']);
  assert.deepEqual(table.statuses.map((status) => status.status), ['thinking', 'acted']);

  const checked = await emitWithAck<{ ok: boolean }>(table.human, 'game:action', { roomId: ROOM, type: 'check', seq: 1 });
  assert.equal(checked.ok, true);
});

test('a hand that ends is folded into the room ledger', async (t) => {
  const rooms: RuntimeRoom[] = [];
  const base = createCliBotRuntime({ timeoutMs: 30_000, run: async () => answer('A'), log: () => undefined });
  const table = await setup({
    get enabled() {
      return base.enabled;
    },
    timeoutMs: base.timeoutMs,
    decide: base.decide,
    ledgerOf: base.ledgerOf,
    recordHandEnd: (room) => {
      rooms.push(room);
      base.recordHandEnd(room);
    },
  });
  t.after(table.cleanup);

  await table.addBot(HAIKU);
  assert.deepEqual(await table.start(), { ok: true });
  // The bot folds the small blind (A), which ends the hand.
  await waitFor(() => table.botActions.length === 1 && rooms.some((room) => room.hand?.phase === 'hand_end'));
  assert.deepEqual(table.botActions, ['fold']);
  assert.deepEqual(Object.keys(base.ledgerOf(rooms[0]!).players).sort(), ['bot-claude-1', 'human-1']);
});

test('a timeout plays TAG for that decision, says so, and leaves the bots on', async (t) => {
  const cliBots = createCliBotRuntime({ timeoutMs: 30_000, run: async () => result('', { timedOut: true, exitCode: null }), log: () => undefined });
  const table = await setup(cliBots);
  t.after(table.cleanup);

  await table.addBot(HAIKU);
  assert.deepEqual(await table.start(), { ok: true });
  await waitFor(() => table.statuses.some((status) => status.status === 'acted'));
  assert.deepEqual(table.statuses.map((status) => [status.status, status.message]), [['thinking', undefined], ['error', 'timeout'], ['acted', undefined]]);
  assert.equal(table.botActions.length, 1);
  assert.equal(cliBots.enabled, true);
});

test('a usage limit turns the bots off for the process, tells the room, and the option goes away', async (t) => {
  const calls: number[] = [];
  const cliBots = createCliBotRuntime({ timeoutMs: 30_000, run: async () => (calls.push(1), usageLimit()), log: () => undefined });
  const table = await setup(cliBots);
  t.after(table.cleanup);

  await table.addBot(HAIKU);
  assert.deepEqual(await table.start(), { ok: true });
  await waitFor(() => table.statuses.some((status) => status.status === 'acted'));
  assert.deepEqual(table.statuses.map((status) => [status.status, status.message]), [['thinking', undefined], ['error', 'cli_unavailable'], ['acted', undefined]]);
  assert.equal(table.botActions.length, 1, 'the seat still plays, as TAG');
  assert.equal(cliBots.enabled, false);
  assert.equal(calls.length, 1);

  assert.deepEqual(await table.addBot(HAIKU), { ok: false, error: 'cli_bots_disabled' });
});
