import type { RoomState } from './room-socket-state';
import type { RoomJoinIntent } from './room-types';

const ROOM_ERRORS_THAT_RETURN_TO_LOBBY = new Set([
  'room_not_found',
  'room_already_exists',
  'player_name_taken',
  'unauthorized',
  'invalid_payload',
]);

export function getRoomAutoNavigationTarget(roomId: string, isPlaying: boolean): string | null {
  if (!roomId || !isPlaying) {
    return null;
  }

  return `/game/${roomId}`;
}

export function shouldRedirectRoomJoinFailure(error?: string): boolean {
  return Boolean(error && ROOM_ERRORS_THAT_RETURN_TO_LOBBY.has(error));
}

export function shouldNormalizeCreateIntent(
  intent: RoomJoinIntent,
  roomState: RoomState | null,
  playerId: string,
): boolean {
  if (intent !== 'create' || !roomState) {
    return false;
  }

  return roomState.players.some((player) => player.id === playerId);
}
