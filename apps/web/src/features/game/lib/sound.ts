/**
 * Table sound effects: a small pool of `HTMLAudioElement`s per sound, played only after the
 * visitor has interacted with the page (browsers block it before) and never when muted.
 * Everything here is a no-op without `window`/`Audio` (SSR, tests).
 */

export const SOUND_NAMES = [
  'turn',
  'timer-warning',
  'check',
  'bet',
  'raise',
  'all-in',
  'deal',
  'board',
  'win',
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

/** Master volume, 0..1: quiet enough to sit under a conversation. */
export const MASTER_VOLUME = 0.35;
/** Copies of one sound that can overlap (e.g. two quick bets). */
const POOL_SIZE = 3;
export const MUTE_STORAGE_KEY = 'aipoker-sound-muted';

export interface AudioLike {
  volume: number;
  currentTime: number;
  paused: boolean;
  ended: boolean;
  play: () => Promise<void> | void;
}

export interface SoundPlayerDeps {
  createAudio: (src: string) => AudioLike;
  isUnlocked: () => boolean;
  isMuted: () => boolean;
}

export function soundUrl(name: SoundName): string {
  return `/sounds/${name}.mp3`;
}

export function createSoundPlayer({ createAudio, isUnlocked, isMuted }: SoundPlayerDeps) {
  const pools = new Map<SoundName, AudioLike[]>();
  const nextSteal = new Map<SoundName, number>();

  const poolFor = (name: SoundName): AudioLike[] => {
    let pool = pools.get(name);
    if (!pool) {
      pool = [createAudio(soundUrl(name))];
      pools.set(name, pool);
    }
    return pool;
  };

  // An idle copy if there is one, else a new one up to POOL_SIZE, else the one that started first.
  const acquire = (name: SoundName): AudioLike => {
    const pool = poolFor(name);
    const idle = pool.find((audio) => audio.paused || audio.ended);
    if (idle) return idle;
    if (pool.length < POOL_SIZE) {
      const created = createAudio(soundUrl(name));
      pool.push(created);
      return created;
    }
    const index = (nextSteal.get(name) ?? 0) % pool.length;
    nextSteal.set(name, index + 1);
    return pool[index] as AudioLike;
  };

  return {
    /** Create the first copy of every sound so the files are fetched before they are needed. */
    preload() {
      for (const name of SOUND_NAMES) poolFor(name);
    },
    play(name: SoundName) {
      if (isMuted() || !isUnlocked()) return;
      try {
        const audio = acquire(name);
        audio.volume = MASTER_VOLUME;
        audio.currentTime = 0;
        const started = audio.play();
        if (started && typeof started.catch === 'function') started.catch(() => {});
      } catch {
        // Sound is a nicety; a blocked or broken player must never reach the game.
      }
    },
  };
}

// ── Mute preference ──

export function readMutedPreference(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMutedPreference(storage: Pick<Storage, 'setItem'> | null, muted: boolean): void {
  try {
    storage?.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Private mode or blocked storage: the choice just lasts for this page.
  }
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

let muted: boolean | null = null;
const mutedListeners = new Set<() => void>();

export function getSoundMuted(): boolean {
  muted ??= readMutedPreference(getStorage());
  return muted;
}

export function setSoundMuted(next: boolean): void {
  muted = next;
  writeMutedPreference(getStorage(), next);
  for (const listener of mutedListeners) listener();
}

export function subscribeSoundMuted(listener: () => void): () => void {
  mutedListeners.add(listener);
  return () => mutedListeners.delete(listener);
}

// ── Browser player ──

let gestureSeen = false;
let player: ReturnType<typeof createSoundPlayer> | null = null;

function hasUserGesture(): boolean {
  return gestureSeen || Boolean(navigator.userActivation?.hasBeenActive);
}

function getPlayer(): ReturnType<typeof createSoundPlayer> | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  player ??= createSoundPlayer({
    createAudio: (src) => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      return audio;
    },
    isUnlocked: hasUserGesture,
    isMuted: getSoundMuted,
  });
  return player;
}

export function playSound(name: SoundName): void {
  getPlayer()?.play(name);
}

/** Fetch the files now and note the first click or key press. Returns the cleanup. */
export function primeSounds(): () => void {
  const current = getPlayer();
  if (!current) return () => {};
  current.preload();
  const onGesture = () => {
    gestureSeen = true;
  };
  const events = ['pointerdown', 'keydown'] as const;
  for (const type of events) window.addEventListener(type, onGesture, { capture: true, passive: true });
  return () => {
    for (const type of events) window.removeEventListener(type, onGesture, { capture: true });
  };
}
