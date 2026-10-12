import type { MessageKey } from '@/i18n';
import type { RoomPlayer, RoomState } from './room-socket-state';

export interface RoomPageState {
  humanPlayers: RoomPlayer[];
  allHumansReady: boolean;
  hasEnoughPlayers: boolean;
  activeStackPlayerCount: number;
  isTableFinished: boolean;
  selfPlayer: RoomPlayer | null;
  canSelfStart: boolean;
  /** The current player is the only human: Start readies them first, no separate Ready press. */
  isSoloHuman: boolean;
  canStart: boolean;
}

export function getRoomPageState(roomState: RoomState | null, playerId: string): RoomPageState {
  const humanPlayers = roomState?.players.filter((player) => !player.isBot) ?? [];
  const allHumansReady = humanPlayers.length > 0 && humanPlayers.every((player) => player.isReady);
  const hasEnoughPlayers = (roomState?.playerCount ?? 0) >= 2;
  const activeStackPlayerCount = roomState?.table.activeStackPlayerCount ?? 0;
  const isTableFinished = roomState?.table.isTableFinished ?? false;
  const selfPlayer = roomState?.players.find((player) => player.id === playerId) ?? null;
  const canSelfStart = selfPlayer ? (!selfPlayer.isBot && selfPlayer.stack > 0) : true;
  const isSoloHuman = humanPlayers.length === 1 && humanPlayers[0]?.id === playerId;
  const canStart = (allHumansReady || isSoloHuman)
    && hasEnoughPlayers
    && !roomState?.isPlaying
    && canSelfStart
    && (roomState?.table.canStartNextHand ?? hasEnoughPlayers);

  return {
    humanPlayers,
    allHumansReady,
    hasEnoughPlayers,
    activeStackPlayerCount,
    isTableFinished,
    selfPlayer,
    canSelfStart,
    isSoloHuman,
    canStart,
  };
}

export interface RoomStatusInput {
  isConnected: boolean;
  isPlaying: boolean;
  isTableFinished: boolean;
  canSelfStart: boolean;
  hasEnoughPlayers: boolean;
  isReady: boolean;
  allHumansReady: boolean;
}

/** The one-line "what happens next" shown above the waiting room buttons. */
export function getRoomStatusKey(input: RoomStatusInput): MessageKey {
  if (!input.isConnected) return 'lobby.room.status.connecting';
  if (input.isTableFinished) return 'lobby.room.status.finished';
  if (!input.canSelfStart) return 'lobby.room.status.eliminated';
  if (input.isPlaying) return 'lobby.room.status.playing';
  if (!input.hasEnoughPlayers) return 'lobby.room.status.needPlayers';
  if (!input.isReady) return 'lobby.room.status.needReady';
  if (!input.allHumansReady) return 'lobby.room.status.waitOthers';
  return 'lobby.room.status.canStart';
}
