import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import type { AgentLlmClient } from '@aipoker/agent-engine';
import { io as createClient } from 'socket.io-client';

import { createServer } from '../../../index.ts';
import { attachRealtime } from '../../../realtime.ts';

function emitWithAck<T>(
  socket: ReturnType<typeof createClient>,
  event: string,
  payload: unknown,
  timeoutMs = 2_000,
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

function waitForBotStatus(
  socket: ReturnType<typeof createClient>,
  predicate: (payload: any) => boolean,
  timeoutMs = 2_000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game:bot_status', onBotStatus);
      reject(new Error('timed out waiting for game:bot_status'));
    }, timeoutMs);

    const onBotStatus = (payload: any) => {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timer);
      socket.off('game:bot_status', onBotStatus);
      resolve(payload);
    };

    socket.on('game:bot_status', onBotStatus);
  });
}

function waitForGameEvent(
  socket: ReturnType<typeof createClient>,
  predicate: (payload: any) => boolean,
  timeoutMs = 2_000,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

async function setupHeadsUpRealtimeTable(
  llmClient: AgentLlmClient,
  options: {
    realtimeTimeoutMs?: number;
  } = {},
) {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, {
    llmAgent: {
      enabled: true,
      llmClient,
      realtimeTimeoutMs: options.realtimeTimeoutMs ?? 500,
      maxToolRoundsRealtime: 1,
      maxCompletionTokens: 400,
    },
    botRuntime: {
      sleep: async () => {},
      nowMs: () => 42,
    },
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const human = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const botSocket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });

  await once(human, 'connect');
  await once(botSocket, 'connect');

  await emitWithAck(human, 'room:create', {
    roomId: 'AAABK2',
    smallBlind: 50,
    bigBlind: 100,
  });
  await emitWithAck(human, 'room:join', {
    roomId: 'AAABK2',
    playerId: 'human-1',
    playerName: 'Human',
    seatIndex: 0,
    stack: 1_000,
  });
  await emitWithAck(human, 'room:join', {
    roomId: 'AAABK2',
    playerId: 'bot-1',
    playerName: 'LLM Bot',
    seatIndex: 1,
    stack: 2_000,
    isBot: true,
    botModel: 'gpt',
    botPersonaId: 'analyst',
  });

  return {
    app,
    io,
    human,
    botSocket,
    async cleanup() {
      human.close();
      botSocket.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await app.close();
    },
  };
}

test('llm bot starts thinking without blocking later room tasks while the decision is still pending', async (t) => {
  const deferred = createDeferred<any>();
  const llmClient: AgentLlmClient = {
    complete: async () => deferred.promise,
  };
  const setup = await setupHeadsUpRealtimeTable(llmClient);

  t.after(async () => {
    deferred.reject(new Error('test cleanup'));
    await setup.cleanup();
  });

  const thinkingPromise = waitForBotStatus(
    setup.human,
    (payload) => payload.roomId === 'AAABK2' && payload.playerId === 'bot-1' && payload.status === 'thinking',
  );

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(setup.human, 'game:start', {
    roomId: 'AAABK2',
    buttonMarkerSeat: 1,
  });

  assert.deepEqual(startAck, { ok: true });
  await thinkingPromise;

  const leaveAck = await emitWithAck<{ ok: boolean; error?: string }>(
    setup.human,
    'room:leave',
    {},
    500,
  );
  assert.deepEqual(leaveAck, { ok: true, roomId: 'AAABK2', playerCount: 2 });
});

test('llm bot timeout falls back, emits error then acted, and discards the late model response', async (t) => {
  const deferred = createDeferred<any>();
  const llmClient: AgentLlmClient = {
    complete: async () => deferred.promise,
  };
  const setup = await setupHeadsUpRealtimeTable(llmClient, { realtimeTimeoutMs: 40 });
  const statuses: string[] = [];
  const botActions: string[] = [];

  setup.human.on('game:bot_status', (payload: any) => {
    if (payload.roomId === 'AAABK2' && payload.playerId === 'bot-1') {
      statuses.push(payload.status);
    }
  });
  setup.human.on('game:event', (payload: any) => {
    if (payload.roomId === 'AAABK2' && payload.action.playerId === 'bot-1') {
      botActions.push(payload.action.type);
    }
  });

  t.after(async () => {
    deferred.reject(new Error('test cleanup'));
    await setup.cleanup();
  });

  const botActionPromise = waitForGameEvent(
    setup.human,
    (payload) => payload.roomId === 'AAABK2' && payload.action.playerId === 'bot-1',
    1_000,
  );
  const actedStatusPromise = waitForBotStatus(
    setup.human,
    (payload) => payload.roomId === 'AAABK2' && payload.playerId === 'bot-1' && payload.status === 'acted',
    1_000,
  );

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(setup.human, 'game:start', {
    roomId: 'AAABK2',
    buttonMarkerSeat: 1,
  });
  assert.deepEqual(startAck, { ok: true });

  const botAction = await botActionPromise;
  await actedStatusPromise;
  // The timed-out seat plays the TAG heuristic fallback, so the exact action depends on the dealt cards.
  assert.ok(['fold', 'check', 'call', 'raise_to', 'all_in'].includes(botAction.action.type));
  assert.deepEqual(statuses, ['thinking', 'error', 'acted']);

  deferred.resolve({
    type: 'action_plan',
    actionPlan: {
      skillId: 'preflop_open',
      intent: 'fold',
      confidence: 0.9,
      reasoning: {
        situation: 'late',
        analysis: 'late',
        decision: 'late',
        alternativeConsidered: 'late',
      },
    },
  });

  await sleep(100);
  assert.deepEqual(botActions, [botAction.action.type], 'the late model response must not be applied');
});

test('llm bot success path emits thinking then acted without an error event', async (t) => {
  const llmClient: AgentLlmClient = {
    complete: async (request) => ({
      type: 'action_plan',
      actionPlan: {
        skillId: request.responseFormat.json_schema.name.replace(/_action_plan$/, '') as any,
        intent: 'fold',
        confidence: 0.82,
        reasoning: {
          situation: 'preflop node',
          analysis: 'take a conservative branch',
          decision: 'fold',
          alternativeConsidered: 'raise',
        },
      },
    }),
  };
  const setup = await setupHeadsUpRealtimeTable(llmClient);
  const statuses: string[] = [];

  setup.human.on('game:bot_status', (payload: any) => {
    if (payload.roomId === 'AAABK2' && payload.playerId === 'bot-1') {
      statuses.push(payload.status);
    }
  });

  t.after(async () => {
    await setup.cleanup();
  });

  const botActionPromise = waitForGameEvent(
    setup.human,
    (payload) => payload.roomId === 'AAABK2' && payload.action.playerId === 'bot-1',
    1_000,
  );

  const startAck = await emitWithAck<{ ok: boolean; error?: string }>(setup.human, 'game:start', {
    roomId: 'AAABK2',
    buttonMarkerSeat: 1,
  });
  assert.deepEqual(startAck, { ok: true });

  const botAction = await botActionPromise;
  assert.equal(botAction.action.type, 'fold');
  // bot_status 'acted' is emitted right after the state broadcast, so it can land one packet later.
  const deadline = Date.now() + 1_000;
  while (!statuses.includes('acted') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.deepEqual(statuses, ['thinking', 'acted']);
});
