import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { HandState, TableLifecycleSnapshot, ValidActions } from '@aipoker/shared';

/**
 * gameStore — 游戏实时状态
 *
 * 单一真源来自服务端快照（server snapshot is truth）。
 * MVP 不做乐观更新。
 */

export interface PayoutInfo {
  playerId: string;
  playerName: string;
  amount: number;
  handRankName: string;    // "两对", "同花顺", etc.
  bestCards: string[];     // 5 cards forming best hand
}

export interface HandResult {
  payouts: PayoutInfo[];
  winnerIds: string[];
  potTotal: number;
  phase: 'announcing' | 'revealing' | 'showing' | 'done';
  table: TableLifecycleSnapshot;
}

interface GameState {
  // ── 当前手牌状态（服务端权威快照） ──
  hand: HandState | null;
  stateVersion: number | null;
  validActions: ValidActions | null;
  timerStartedAt: number | null;   // 当前行动者计时开始时间 (Date.now())
  timerDurationMs: number;

  // ── 结算状态 ──
  isWinning: boolean;              // 触发赢牌动画
  winnerCards: string[];           // 赢家高亮牌
  handResult: HandResult | null;   // 手牌结果（赢家公告等）
  nextHandRequested: boolean;      // 已请求发下一手（防抖防重）

  // ── 连接状态 ──
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
  lastError: string | null;

  // ── Actions ──
  setHandState: (hand: HandState, stateVersion?: number) => void;
  setValidActions: (actions: ValidActions, timeoutMs: number) => void;
  clearValidActions: () => void;
  setHandResult: (result: HandResult) => void;
  setHandResultPhase: (phase: HandResult['phase']) => void;
  clearHandResult: () => void;
  markNextHandRequested: () => void;
  clearNextHandRequested: () => void;
  setConnectionStatus: (status: GameState['connectionStatus']) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  hand: null,
  stateVersion: null,
  validActions: null,
  timerStartedAt: null,
  timerDurationMs: 30000,
  isWinning: false,
  winnerCards: [] as string[],
  handResult: null as HandResult | null,
  nextHandRequested: false,
  connectionStatus: 'connecting' as const,
  lastError: null,
};

const EMPTY_WINNER_IDS: string[] = [];

export const useGameStore = create<GameState>()(
  subscribeWithSelector((set) => ({
    ...INITIAL_STATE,

    setHandState: (hand, stateVersion) =>
      set((current) => ({
        hand,
        stateVersion: stateVersion ?? current.stateVersion
      })),

    setValidActions: (actions, timeoutMs) =>
      set({
        validActions: actions,
        timerStartedAt: Date.now(),
        timerDurationMs: timeoutMs,
      }),

    clearValidActions: () =>
      set({ validActions: null, timerStartedAt: null }),

    setHandResult: (result) =>
      set({
        handResult: result,
        isWinning: true,
        winnerCards: [...new Set(result.payouts.flatMap((p) => p.bestCards))],
      }),

    setHandResultPhase: (phase) =>
      set((current) => {
        if (!current.handResult || current.handResult.phase === phase) {
          return current;
        }
        return { handResult: { ...current.handResult, phase } };
      }),

    clearHandResult: () =>
      set({
        handResult: null,
        isWinning: false,
        winnerCards: [],
        nextHandRequested: false,
      }),

    markNextHandRequested: () => set({ nextHandRequested: true }),

    clearNextHandRequested: () => set({ nextHandRequested: false }),

    setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

    setError: (lastError) => set({ lastError }),

    reset: () => set(INITIAL_STATE),
  })),
);

// ── Selectors（避免过度订阅） ──

export const selectHand = (s: GameState) => s.hand;
export const selectValidActions = (s: GameState) => s.validActions;
export const selectIsMyTurn = (currentUserId: string) => (s: GameState) =>
  s.validActions !== null &&
  s.hand?.currentActorSeat === s.hand?.players.find((p) => p.id === currentUserId)?.seatIndex;
export const selectConnectionStatus = (s: GameState) => s.connectionStatus;
export const selectHandResult = (s: GameState) => s.handResult;
export const selectWinnerIds = (s: GameState) => s.handResult?.winnerIds ?? EMPTY_WINNER_IDS;
export const selectIsHandEnding = (s: GameState) => s.hand?.phase === 'hand_end';
export const selectIsTableFinished = (s: GameState) => Boolean(s.handResult?.table.isTableFinished);
export const selectCanStartNextHand = (s: GameState) => s.handResult?.table.canStartNextHand ?? true;
export const selectIsBotsOnlyContinuation = (s: GameState) => Boolean(s.handResult?.table.isBotsOnlyContinuation);
export const selectChampionInfo = (() => {
  let cachedId: string | null = null;
  let cachedName: string | null = null;
  let cachedValue: { id: string; name: string } | null = null;

  return (s: GameState) => {
    const table = s.handResult?.table;
    const id = table?.championPlayerId ?? null;
    const name = table?.championPlayerName ?? null;

    if (!id || !name) {
      cachedId = null;
      cachedName = null;
      cachedValue = null;
      return null;
    }

    if (cachedValue && cachedId === id && cachedName === name) {
      return cachedValue;
    }

    cachedId = id;
    cachedName = name;
    cachedValue = { id, name };
    return cachedValue;
  };
})();
