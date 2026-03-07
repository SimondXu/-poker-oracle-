export type EmptyRoomTimeouts = Map<string, ReturnType<typeof setTimeout>>;

export function clearEmptyRoomTimeout(emptyRoomTimeouts: EmptyRoomTimeouts, roomId: string): void {
  const handle = emptyRoomTimeouts.get(roomId);
  if (!handle) {
    return;
  }

  clearTimeout(handle);
  emptyRoomTimeouts.delete(roomId);
}

export function scheduleEmptyRoomTimeout(
  emptyRoomTimeouts: EmptyRoomTimeouts,
  roomId: string,
  timeoutMs: number,
  onTimeout: () => void,
): void {
  clearEmptyRoomTimeout(emptyRoomTimeouts, roomId);

  const handle = setTimeout(() => {
    emptyRoomTimeouts.delete(roomId);
    onTimeout();
  }, timeoutMs);

  handle.unref?.();

  emptyRoomTimeouts.set(roomId, handle);
}
