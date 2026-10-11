import type { MessageKey } from '@/i18n';

const ROOM_ERROR_KEYS: Record<string, MessageKey> = {
  invalid_payload: 'lobby.room.error.invalidPayload',
  unauthorized: 'lobby.room.error.unauthorized',
  room_not_found: 'lobby.room.error.roomNotFound',
  room_already_exists: 'lobby.room.error.roomAlreadyExists',
  rate_limited: 'lobby.room.error.rateLimited',
  player_name_taken: 'lobby.room.error.nameTaken',
  timeout: 'lobby.room.error.timeout',
  players_not_ready: 'lobby.room.error.playersNotReady',
  not_enough_players: 'lobby.room.error.notEnoughPlayers',
  hand_already_started: 'lobby.room.error.handInProgress',
  starter_not_active: 'lobby.room.error.starterOut',
  table_finished: 'lobby.room.error.tableFinished',
  not_room_member: 'lobby.room.error.notMember',
};

/** Message key for a server error code, or the caller's fallback key for unknown/missing codes. */
export function getRoomErrorKey(error: string | undefined, fallback: MessageKey): MessageKey {
  if (!error) {
    return fallback;
  }

  return ROOM_ERROR_KEYS[error] ?? fallback;
}
