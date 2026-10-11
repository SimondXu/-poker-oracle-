export const LAST_USERNAME_KEY = 'aipoker-last-username';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The name used last time on this device, or null. Never throws (private mode, blocked storage). */
export function readLastUsername(storage: StorageLike | null = defaultStorage()): string | null {
  try {
    const value = storage?.getItem(LAST_USERNAME_KEY)?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

export function saveLastUsername(name: string, storage: StorageLike | null = defaultStorage()): void {
  const value = name.trim();
  if (!value) {
    return;
  }

  try {
    storage?.setItem(LAST_USERNAME_KEY, value);
  } catch {
    // Storage unavailable: the name is just not remembered.
  }
}
