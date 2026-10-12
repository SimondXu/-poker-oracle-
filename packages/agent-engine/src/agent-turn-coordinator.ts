import { randomUUID } from 'node:crypto';

export type AgentTurnResolution<TResult> =
  | {
      type: 'completed';
      action: TResult;
    }
  | {
      type: 'timeout';
      error: 'timeout';
    }
  | {
      type: 'error';
      error: string;
    };

export interface AgentTurnStatusEvent {
  roomId: string;
  playerId: string;
  status: 'thinking';
  turnToken: string;
}

export interface StartAgentTurnInput<TResult> {
  roomId: string;
  playerId: string;
  timeoutMs: number;
  // The signal is aborted when the turn times out, is replaced, or its room is cancelled.
  run: (signal: AbortSignal) => Promise<AgentTurnResolution<TResult>>;
  emitStatus: (event: AgentTurnStatusEvent) => void;
  scheduleResolution: (roomId: string, playerId: string, resolution: AgentTurnResolution<TResult>, turnToken: string) => void;
}

export interface StartAgentTurnResult {
  accepted: boolean;
  turnToken: string;
}

export interface AgentTurnCoordinatorOptions {
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}

interface PendingTurn {
  turnToken: string;
  timeoutId: ReturnType<typeof globalThis.setTimeout>;
  abortController: AbortController;
}

function buildTurnKey(roomId: string, playerId: string): string {
  return `${roomId}:${playerId}`;
}

function createTurnToken(): string {
  return `turn_${randomUUID()}`;
}

export interface AgentTurnCoordinator<TResult> {
  startTurn: (input: StartAgentTurnInput<TResult>) => StartAgentTurnResult;
  cancelRoom: (roomId: string) => void;
}

export function createAgentTurnCoordinator<TResult>(
  options: AgentTurnCoordinatorOptions,
): AgentTurnCoordinator<TResult> {
  const pendingTurns = new Map<string, PendingTurn>();

  function clearPendingTurn(key: string): void {
    const pending = pendingTurns.get(key);
    if (!pending) {
      return;
    }

    options.clearTimeout(pending.timeoutId);
    pending.abortController.abort();
    pendingTurns.delete(key);
  }

  return {
    startTurn(input) {
      const key = buildTurnKey(input.roomId, input.playerId);
      clearPendingTurn(key);

      const turnToken = createTurnToken();
      const abortController = new AbortController();
      const timeoutId = options.setTimeout(() => {
        const latest = pendingTurns.get(key);
        if (!latest || latest.turnToken !== turnToken) {
          return;
        }

        pendingTurns.delete(key);
        abortController.abort();
        input.scheduleResolution(
          input.roomId,
          input.playerId,
          {
            type: 'timeout',
            error: 'timeout',
          },
          turnToken,
        );
      }, input.timeoutMs);

      pendingTurns.set(key, { turnToken, timeoutId, abortController });
      input.emitStatus({
        roomId: input.roomId,
        playerId: input.playerId,
        status: 'thinking',
        turnToken,
      });

      void input.run(abortController.signal)
        .then((resolution) => {
          const latest = pendingTurns.get(key);
          if (!latest || latest.turnToken !== turnToken) {
            return;
          }

          pendingTurns.delete(key);
          options.clearTimeout(timeoutId);
          input.scheduleResolution(input.roomId, input.playerId, resolution, turnToken);
        })
        .catch((error: unknown) => {
          const latest = pendingTurns.get(key);
          if (!latest || latest.turnToken !== turnToken) {
            return;
          }

          pendingTurns.delete(key);
          options.clearTimeout(timeoutId);
          input.scheduleResolution(
            input.roomId,
            input.playerId,
            {
              type: 'error',
              error: error instanceof Error ? error.message : 'unknown_error',
            },
            turnToken,
          );
        });

      return {
        accepted: true,
        turnToken,
      };
    },
    cancelRoom(roomId) {
      for (const [key] of pendingTurns) {
        if (!key.startsWith(`${roomId}:`)) {
          continue;
        }

        clearPendingTurn(key);
      }
    },
  };
}
