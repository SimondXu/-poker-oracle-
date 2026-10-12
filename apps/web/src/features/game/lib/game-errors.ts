import { getRoomErrorKey } from '../../room/lib/room-errors.ts';
import type { MessageKey } from '../../../i18n/catalog.ts';

const GAME_ERROR_KEYS: Record<string, MessageKey> = {
  stale_state_version: 'common.game.error.staleState',
  duplicate_action_seq: 'common.game.error.duplicateAction',
  not_current_actor: 'common.game.error.notYourTurn',
  hand_not_started: 'common.game.error.handNotStarted',
  hand_not_actionable: 'common.game.error.handNotActionable',
  invalid_action: 'common.game.error.invalidAction',
  hand_in_progress: 'lobby.room.error.handInProgress',
};

/**
 * Message key for a server error code on the game screen (room errors included).
 * Unknown or missing codes resolve to `fallback`; a raw code is never shown.
 */
export function getGameErrorKey(error: string | undefined, fallback: MessageKey): MessageKey {
  if (error && Object.hasOwn(GAME_ERROR_KEYS, error)) {
    return GAME_ERROR_KEYS[error]!;
  }

  return getRoomErrorKey(error, fallback);
}
