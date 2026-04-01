import type { RoomPlayer, RoomState } from './room-socket-state';

export interface RoomPageState {
  humanPlayers: RoomPlayer[];
  allHumansReady: boolean;
  hasEnoughPlayers: boolean;
  activeStackPlayerCount: number;
  isTableFinished: boolean;
  selfPlayer: RoomPlayer | null;
  canSelfStart: boolean;
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
  const canStart = allHumansReady
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
    canStart,
  };
}
