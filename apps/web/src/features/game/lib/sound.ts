/**
 * Table sound effects: recorded CC0 clips, a small pool of `HTMLAudioElement`s per file. A sound
 * with several variants picks one at random (never the same twice in a row) and plays it at a
 * slightly random pitch. Played only after the visitor has interacted with the page (browsers
 * block it before) and never when muted.
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

/** Files per sound (under `public/sounds/`); a sound with several plays a random one. */
export const SOUND_FILES: Record<SoundName, readonly string[]> = {
  turn: ['turn'],
  'timer-warning': ['timer-warning'],
  check: ['check'],
  bet: ['bet-1', 'bet-2', 'bet-3'],
  raise: ['raise-1', 'raise-2', 'raise-3'],
  'all-in': ['all-in-1', 'all-in-2'],
  deal: ['deal'],
  board: ['board'],
  win: ['win-1', 'win-2'],
};

/** Playback speed is drawn uniformly from 1 ± this (pitch moves with it), so repeats never sound identical. */
export const PITCH_SPREAD = 0.03;

/** Master volume, 0..1: quiet enough to sit under a conversation. */
export const MASTER_VOLUME = 0.35;
/** Copies of one sound that can overlap (e.g. two quick bets). */
const POOL_SIZE = 3;
export const MUTE_STORAGE_KEY = 'aipoker-sound-muted';

export interface AudioLike {
  volume: number;
  currentTime: number;
  playbackRate: number;
  preservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  paused: boolean;
  ended: boolean;
  play: () => Promise<void> | void;
}

export interface SoundPlayerDeps {
  createAudio: (src: string) => AudioLike;
  isUnlocked: () => boolean;
  isMuted: () => boolean;
  /** Uniform in [0, 1); injectable so tests are deterministic. */
  random?: () => number;
}

export function soundUrl(file: string): string {
  return `/sounds/${file}.mp3`;
}

export function createSoundPlayer({ createAudio, isUnlocked, isMuted, random = Math.random }: SoundPlayerDeps) {
  const pools = new Map<string, AudioLike[]>();
  const nextSteal = new Map<string, number>();
  const lastVariant = new Map<SoundName, number>();

  const poolFor = (file: string): AudioLike[] => {
    let pool = pools.get(file);
    if (!pool) {
      pool = [createAudio(soundUrl(file))];
      pools.set(file, pool);
    }
    return pool;
  };

  // An idle copy if there is one, else a new one up to POOL_SIZE, else the one that started first.
  const acquire = (file: string): AudioLike => {
    const pool = poolFor(file);
    const idle = pool.find((audio) => audio.paused || audio.ended);
    if (idle) return idle;
    if (pool.length < POOL_SIZE) {
      const created = createAudio(soundUrl(file));
      pool.push(created);
      return created;
    }
    const index = (nextSteal.get(file) ?? 0) % pool.length;
    nextSteal.set(file, index + 1);
    return pool[index] as AudioLike;
  };

  // A random variant, skipping the one that just played when there is a choice.
  const pickFile = (name: SoundName): string => {
    const files = SOUND_FILES[name];
    const last = lastVariant.get(name);
    const choices = files.length > 1 && last !== undefined ? files.length - 1 : files.length;
    let index = Math.min(Math.floor(random() * choices), choices - 1);
    if (choices < files.length && last !== undefined && index >= last) index += 1;
    lastVariant.set(name, index);
    return files[index] as string;
  };

  return {
    /** Create the first copy of every file so they are fetched before they are needed. */
    preload() {
      for (const name of SOUND_NAMES) for (const file of SOUND_FILES[name]) poolFor(file);
    },
    play(name: SoundName) {
      if (isMuted() || !isUnlocked()) return;
      try {
        const audio = acquire(pickFile(name));
        audio.volume = MASTER_VOLUME;
        audio.currentTime = 0;
        // Pitch follows speed (no time-stretch correction), which is what makes repeats differ.
        audio.preservesPitch = false;
        audio.webkitPreservesPitch = false;
        audio.mozPreservesPitch = false;
        audio.playbackRate = 1 - PITCH_SPREAD + random() * 2 * PITCH_SPREAD;
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
