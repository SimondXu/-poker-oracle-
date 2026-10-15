import type { BotPersonality, CliAgentModel, RoomStateEvent, TableLifecycleSnapshot } from '@aipoker/shared';

export interface RoomPlayer {
  id: string;
  name: string;
  seatIndex: number;
  stack: number;
  isBot: boolean;
  botStrategy: BotPersonality | null;
  /** Set for Claude Code bots only. */
  botModel?: CliAgentModel;
  isReady: boolean;
}

export interface RoomState {
  players: RoomPlayer[];
  playerCount: number;
  readyCount: number;
  isPlaying: boolean;
  table: TableLifecycleSnapshot;
  hostPlayerId: string | null;
  /** The server offers Claude Code bots. */
  cliBots?: boolean;
}

export interface RoomSocketViewState {
  roomState: RoomState | null;
  isConnected: boolean;
  isReady: boolean;
}

export type RoomSocketViewAction =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'reset' }
  | { type: 'roomStateReceived'; roomState: RoomState; playerId: string };

function createInitialRoomSocketViewState(): RoomSocketViewState {
  return {
    roomState: null,
    isConnected: false,
    isReady: false,
  };
}

export const initialRoomSocketViewState = createInitialRoomSocketViewState();

export function toRoomState(state: RoomStateEvent): RoomState {
  return {
    players: state.players,
    playerCount: state.playerCount,
    readyCount: state.readyCount,
    isPlaying: state.isPlaying,
    table: state.table,
    hostPlayerId: state.hostPlayerId,
    cliBots: state.cliBots === true,
  };
}

export function roomSocketViewReducer(state: RoomSocketViewState, action: RoomSocketViewAction): RoomSocketViewState {
  switch (action.type) {
    case 'connected':
      return {
        ...state,
        isConnected: true,
        isReady: false,
      };
    case 'disconnected':
      return {
        ...state,
        isConnected: false,
        isReady: false,
      };
    case 'reset':
      return createInitialRoomSocketViewState();
    case 'roomStateReceived': {
      const self = action.roomState.players.find((player) => player.id === action.playerId);
      return {
        ...state,
        roomState: action.roomState,
        isReady: Boolean(self?.isReady),
      };
    }
  }
}
