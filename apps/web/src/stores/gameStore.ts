import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { HandState, ValidActions, RoomState } from '@aipoker/shared';

/**
 * gameStore — 游戏实时状态
 *
 * 单一真源来自服务端快照（server snapshot is truth）。
 * MVP 不做乐观更新。
 */

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

  // ── 连接状态 ──
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
  lastError: string | null;

  // ── Actions ──
  setHandState: (hand: HandState, stateVersion?: number) => void;
  setValidActions: (actions: ValidActions, timeoutMs: number) => void;
  clearValidActions: () => void;
  setWinnerState: (winnerCards: string[]) => void;
  clearWinnerState: () => void;
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
  winnerCards: [],
  connectionStatus: 'connecting' as const,
  lastError: null,
};

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

    setWinnerState: (winnerCards) =>
      set({ isWinning: true, winnerCards }),

    clearWinnerState: () =>
      set({ isWinning: false, winnerCards: [] }),

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
