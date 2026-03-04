export type RoomActionTimeouts = Map<string, ReturnType<typeof setTimeout>>;

export function clearRoomActionTimeout(roomActionTimeouts: RoomActionTimeouts, roomId: string): void {
  const existing = roomActionTimeouts.get(roomId);
  if (!existing) {
    return;
  }

  clearTimeout(existing);
  roomActionTimeouts.delete(roomId);
}

export function scheduleRoomActionTimeout(
  roomActionTimeouts: RoomActionTimeouts,
  roomId: string,
  timeoutMs: number,
  onTimeout: () => void
): void {
  clearRoomActionTimeout(roomActionTimeouts, roomId);

  const handle = setTimeout(() => {
    roomActionTimeouts.delete(roomId);
    onTimeout();
  }, timeoutMs);
  handle.unref?.();

  roomActionTimeouts.set(roomId, handle);
}
