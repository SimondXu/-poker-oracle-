import type { RoomPlayer, RoomState } from './room-socket-state';

export interface RoomPageState {
  humanPlayers: RoomPlayer[];
  readyHumanCount: number;
  allHumansReady: boolean;
  hasEnoughPlayers: boolean;
  activeStackPlayerCount: number;
  isTableFinished: boolean;
  selfPlayer: RoomPlayer | null;
  isOwner: boolean;
  canSelfStart: boolean;
  canStart: boolean;
}

export function getRoomPageState(roomState: RoomState | null, playerId: string): RoomPageState {
  const humanPlayers = roomState?.players.filter((player) => !player.isBot) ?? [];
  const readyEligibleHumans = humanPlayers.filter((player) => player.stack > 0);
  const readyHumanCount = readyEligibleHumans.filter((player) => player.isReady).length;
  const allHumansReady = readyEligibleHumans.length > 0 && readyEligibleHumans.every((player) => player.isReady);
  const hasEnoughPlayers = (roomState?.playerCount ?? 0) >= 2;
  const activeStackPlayerCount = roomState?.table.activeStackPlayerCount ?? 0;
  const isTableFinished = roomState?.table.isTableFinished ?? false;
  const selfPlayer = roomState?.players.find((player) => player.id === playerId) ?? null;
  const isOwner = roomState?.ownerId === playerId;
  const canSelfStart = selfPlayer ? (!selfPlayer.isBot && selfPlayer.stack > 0) : true;
  const canStart = allHumansReady
    && isOwner
    && hasEnoughPlayers
    && !roomState?.isPlaying
    && (roomState?.table.canStartNextHand ?? hasEnoughPlayers);

  return {
    humanPlayers,
    readyHumanCount,
    allHumansReady,
    hasEnoughPlayers,
    activeStackPlayerCount,
    isTableFinished,
    selfPlayer,
    isOwner,
    canSelfStart,
    canStart,
  };
}
