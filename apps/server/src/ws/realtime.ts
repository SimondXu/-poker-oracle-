import type { FastifyInstance } from 'fastify';
import { createAgentTurnCoordinator, type AgentLlmClient } from '@aipoker/agent-engine';
import { Server } from 'socket.io';

import { DEFAULT_AUTH_COOKIE_NAME, parseCookies } from '../auth/cookies.ts';
import { createSessionRevocations, resolveGuestSession, type SessionRevocations } from '../auth/session-revocations.ts';
import { createFixedWindowRateLimiter } from '../http/rate-limit.ts';
import { clearRoomActionTimeout, type RoomActionTimeouts } from '../game-loop/action-timeout.ts';
import { clearRoomNextHandTimeout, type RoomNextHandTimeouts } from '../game-loop/auto-next-hand.ts';
import { clearEmptyRoomTimeout, type EmptyRoomTimeouts } from '../game-loop/empty-room-timeout.ts';
import { DEFAULT_BOT_RUNTIME_DEPS, type BotRuntimeDeps } from '../game-loop/bot-support.ts';
import { DISABLED_CLI_BOTS, type CliBotRuntime } from '../game-loop/cli-bot-runtime.ts';
import {
  createRealtimeLlmAgentRunner,
  type RealtimeLlmDecisionResult,
} from '../game-loop/llm-agent-runtime.ts';
import type { RoomTaskQueues } from '../rooms/room-queue.ts';
import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';
import { registerGameEvents } from './handlers/game-events.ts';
import { registerRoomEvents } from './handlers/room-events.ts';
import { setCliBotsOffer } from './cli-bots-offer.ts';

interface AttachRealtimeOptions {
  actionTimeoutMs?: number;
  authSecret?: string;
  authCookieName?: string;
  authStrict?: boolean;
  sessionRevocations?: SessionRevocations;
  corsOrigin?: string;
  emptyRoomTtlMs?: number;
  /** How long a disconnected human keeps their seat (e.g. across a page refresh), before, between, or during hands. */
  waitingRoomReconnectGraceMs?: number;
  nowMs?: () => number;
  botRuntime?: Partial<BotRuntimeDeps>;
  /** Claude Code bots (`startCliBots`); off unless given. */
  cliBots?: CliBotRuntime;
  llmAgent?: {
    enabled?: boolean;
    apiKey?: string | null;
    baseUrl?: string;
    httpReferer?: string | null;
    appTitle?: string;
    maxCompletionTokens?: number;
    maxPromptTokens?: number;
    roomCostLimitUsd?: number;
    maxToolRoundsRealtime?: number;
    realtimeTimeoutMs?: number;
    fetch?: typeof globalThis.fetch;
    llmClient?: AgentLlmClient;
  };
}

export function attachRealtime(app: FastifyInstance, options: AttachRealtimeOptions = {}): Server {
  const io = new Server(app.server, {
    cors: {
      origin: options.corsOrigin ?? 'http://localhost:3000'
    }
  });

  const actionTimeoutMs = options.actionTimeoutMs ?? 30000;
  const authSecret = options.authSecret ?? 'dev-guest-secret-change-me';
  const authCookieName = options.authCookieName ?? DEFAULT_AUTH_COOKIE_NAME;
  const authStrict = options.authStrict ?? false;
  const sessionRevocations = options.sessionRevocations ?? createSessionRevocations();
  const emptyRoomTtlMs = options.emptyRoomTtlMs ?? 60_000;
  const waitingRoomReconnectGraceMs = options.waitingRoomReconnectGraceMs ?? 15_000;
  const nowMs = options.nowMs ?? (() => Date.now());
  const botRuntime: BotRuntimeDeps = {
    ...DEFAULT_BOT_RUNTIME_DEPS,
    ...(options.botRuntime ?? {}),
  };
  const llmAgentRunner = createRealtimeLlmAgentRunner({
    enabled: options.llmAgent?.enabled ?? false,
    apiKey: options.llmAgent?.apiKey ?? null,
    maxCompletionTokens: options.llmAgent?.maxCompletionTokens ?? 600,
    maxToolRoundsRealtime: options.llmAgent?.maxToolRoundsRealtime ?? 1,
    realtimeTimeoutMs: options.llmAgent?.realtimeTimeoutMs ?? 8_000,
    roomCostLimitUsd: options.llmAgent?.roomCostLimitUsd ?? 1,
    rng: botRuntime.rng,
    ...(options.llmAgent?.maxPromptTokens !== undefined ? { maxPromptTokens: options.llmAgent.maxPromptTokens } : {}),
    ...(options.llmAgent?.baseUrl ? { baseUrl: options.llmAgent.baseUrl } : {}),
    ...(options.llmAgent?.httpReferer ? { httpReferer: options.llmAgent.httpReferer } : {}),
    ...(options.llmAgent?.appTitle ? { appTitle: options.llmAgent.appTitle } : {}),
    ...(options.llmAgent?.fetch ? { fetch: options.llmAgent.fetch } : {}),
    ...(options.llmAgent?.llmClient ? { llmClient: options.llmAgent.llmClient } : {}),
  });
  const cliBots = options.cliBots ?? DISABLED_CLI_BOTS;
  setCliBotsOffer(io, () => cliBots.enabled);
  const llmTurnCoordinator = createAgentTurnCoordinator<RealtimeLlmDecisionResult>({
    setTimeout,
    clearTimeout,
  });
  const rooms = new Map<string, RuntimeRoom>();
  const memberships = new Map<string, RoomMembership>();
  const roomActionTimeouts: RoomActionTimeouts = new Map();
  const roomNextHandTimeouts: RoomNextHandTimeouts = new Map();
  const emptyRoomTimeouts: EmptyRoomTimeouts = new Map();
  const waitingRoomRemovals = new Map<string, ReturnType<typeof setTimeout>>();
  const roomTaskQueues: RoomTaskQueues = new Map();
  const roomRateLimit = createFixedWindowRateLimiter();

  function deleteRoom(roomId: string): void {
    clearRoomActionTimeout(roomActionTimeouts, roomId);
    clearRoomNextHandTimeout(roomNextHandTimeouts, roomId);
    clearEmptyRoomTimeout(emptyRoomTimeouts, roomId);
    llmTurnCoordinator.cancelRoom(roomId);
    llmAgentRunner.releaseRoom(roomId);
    rooms.delete(roomId);
  }

  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const authSession = resolveGuestSession({
      token: cookies.get(authCookieName),
      nowMs: nowMs(),
      secret: authSecret,
      revocations: sessionRevocations
    });

    socket.data.authSession = authSession;
    socket.data.authStrict = authStrict;
    next();
  });

  io.on('connection', (socket) => {
    registerRoomEvents({
      io,
      socket,
      rooms,
      memberships,
      emptyRoomTimeouts,
      authStrict,
      actionTimeoutMs,
      emptyRoomTtlMs,
      waitingRoomRemovals,
      waitingRoomReconnectGraceMs,
      nowMs,
      deleteRoom,
      cliBotsEnabled: () => cliBots.enabled,
      rateLimit: roomRateLimit,
    });

    registerGameEvents({
      io,
      socket,
      rooms,
      memberships,
      roomActionTimeouts,
      roomNextHandTimeouts,
      roomTaskQueues,
      actionTimeoutMs,
      nowMs,
      botRuntime,
      llmAgentRunner,
      cliBots,
      llmTurnCoordinator,
      deleteRoom,
    });
  });

  return io;
}
