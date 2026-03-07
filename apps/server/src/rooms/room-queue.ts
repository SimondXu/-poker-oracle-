export type RoomTaskQueues = Map<string, Promise<void>>;

export async function enqueueRoomTask(
  roomTaskQueues: RoomTaskQueues,
  roomId: string,
  task: () => void | Promise<void>
): Promise<void> {
  const previousTask = roomTaskQueues.get(roomId) ?? Promise.resolve();
  const nextTask = previousTask.catch(() => undefined).then(async () => {
    await task();
  });
  roomTaskQueues.set(roomId, nextTask);

  try {
    await nextTask;
  } finally {
    if (roomTaskQueues.get(roomId) === nextTask) {
      roomTaskQueues.delete(roomId);
    }
  }
}
