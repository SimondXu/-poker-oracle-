const ROOM_ERROR_MESSAGES: Record<string, string> = {
  invalid_payload: '请求参数无效，请检查输入后重试',
  unauthorized: '身份校验失败，请返回首页重试',
  room_not_found: '房间不存在，请检查房间号',
  room_already_exists: '房间号已被占用，请重新创建',
  rate_limited: '操作过于频繁，请稍后重试',
  player_name_taken: '该房间内用户名已被占用，请更换用户名后重试',
  not_room_owner: '只有房主可以管理房间配置',
};

export function getRoomErrorMessage(error?: string, fallback = '房间操作失败'): string {
  if (!error) {
    return fallback;
  }

  return ROOM_ERROR_MESSAGES[error] ?? fallback;
}
