export type GameStartErrorCode =
  | 'players_not_ready'
  | 'not_enough_players'
  | 'hand_already_started'
  | 'starter_not_active'
  | 'table_finished'
  | 'not_room_member';

const GAME_START_ERROR_MESSAGES: Record<GameStartErrorCode, string> = {
  players_not_ready: '需要所有玩家准备完毕',
  not_enough_players: '至少需要 2 名玩家',
  hand_already_started: '当前手牌尚未结束',
  starter_not_active: '你已淘汰，不能开始下一手，请选择继续观战或返回大厅',
  table_finished: '本场已结束，请返回大厅重新开局',
  not_room_member: '你不在该房间内，请重新进入房间',
};

export function getGameStartErrorMessage(error: string | undefined, fallback: string): string {
  if (!error) {
    return fallback;
  }

  return GAME_START_ERROR_MESSAGES[error as GameStartErrorCode] ?? error;
}
