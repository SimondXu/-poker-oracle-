export type RoomNextHandTimeouts = Map<string, ReturnType<typeof setTimeout>>;

export function clearRoomNextHandTimeout(roomNextHandTimeouts: RoomNextHandTimeouts, roomId: string): void {
  const handle = roomNextHandTimeouts.get(roomId);
  if (!handle) {
    return;
  }

  clearTimeout(handle);
  roomNextHandTimeouts.delete(roomId);
}

export function scheduleRoomNextHandTimeout(
  roomNextHandTimeouts: RoomNextHandTimeouts,
  roomId: string,
  timeoutMs: number,
  onTimeout: () => void
): void {
  clearRoomNextHandTimeout(roomNextHandTimeouts, roomId);

  const handle = setTimeout(() => {
    roomNextHandTimeouts.delete(roomId);
    onTimeout();
  }, timeoutMs);

  if (typeof (handle as NodeJS.Timeout).unref === 'function') {
    (handle as NodeJS.Timeout).unref();
  }

  roomNextHandTimeouts.set(roomId, handle);
}
