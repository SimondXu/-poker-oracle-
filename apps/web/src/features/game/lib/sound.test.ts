import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MASTER_VOLUME,
  MUTE_STORAGE_KEY,
  createSoundPlayer,
  playSound,
  readMutedPreference,
  writeMutedPreference,
  type AudioLike,
} from './sound.ts';

class FakeAudio implements AudioLike {
  volume = 1;
  currentTime = 5;
  paused = true;
  ended = false;
  plays = 0;
  readonly src: string;
  constructor(src: string) {
    this.src = src;
  }
  play() {
    this.plays += 1;
    this.paused = false;
  }
}

function setup(state: { unlocked?: boolean; muted?: boolean } = {}) {
  const made: FakeAudio[] = [];
  const flags = { unlocked: state.unlocked ?? true, muted: state.muted ?? false };
  const player = createSoundPlayer({
    createAudio: (src) => {
      const audio = new FakeAudio(src);
      made.push(audio);
      return audio;
    },
    isUnlocked: () => flags.unlocked,
    isMuted: () => flags.muted,
  });
  return { player, made, flags };
}

test('plays the named file at the master volume from the start', () => {
  const { player, made } = setup();
  player.play('raise');
  assert.equal(made.length, 1);
  assert.equal(made[0]?.src, '/sounds/raise.mp3');
  assert.equal(made[0]?.volume, MASTER_VOLUME);
  assert.equal(made[0]?.currentTime, 0);
  assert.equal(made[0]?.plays, 1);
});

test('stays silent before a user gesture and while muted', () => {
  const { player, made, flags } = setup({ unlocked: false });
  player.play('bet');
  assert.equal(made.length, 0);

  flags.unlocked = true;
  flags.muted = true;
  player.play('bet');
  assert.equal(made.length, 0);

  flags.muted = false;
  player.play('bet');
  assert.equal(made[0]?.plays, 1);
});

test('rapid repeats overlap on separate copies, then reuse the oldest', () => {
  const { player, made } = setup();
  for (let i = 0; i < 5; i += 1) player.play('bet');
  assert.equal(made.length, 3);
  assert.deepEqual(
    made.map((audio) => audio.plays),
    [2, 2, 1],
  );

  // A copy that finished is reused before any new one is made.
  const { player: second, made: madeSecond } = setup();
  second.play('check');
  (madeSecond[0] as FakeAudio).paused = true;
  second.play('check');
  assert.equal(madeSecond.length, 1);
  assert.equal(madeSecond[0]?.plays, 2);
});

test('preload creates one copy of every sound', () => {
  const { player, made } = setup();
  player.preload();
  assert.equal(made.length, 9);
  assert.equal(made.every((audio) => audio.plays === 0), true);
});

test('a blocked or throwing play never reaches the caller', async () => {
  const rejected = createSoundPlayer({
    createAudio: () => ({ volume: 0, currentTime: 0, paused: true, ended: false, play: () => Promise.reject(new Error('NotAllowedError')) }),
    isUnlocked: () => true,
    isMuted: () => false,
  });
  rejected.play('turn');
  await new Promise((resolve) => setImmediate(resolve));

  const throwing = createSoundPlayer({
    createAudio: () => {
      throw new Error('no audio');
    },
    isUnlocked: () => true,
    isMuted: () => false,
  });
  assert.doesNotThrow(() => throwing.play('turn'));
});

test('playSound is a no-op without a browser', () => {
  assert.doesNotThrow(() => playSound('win'));
});

test('the mute choice round-trips through storage and defaults to sound on', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };

  assert.equal(readMutedPreference(storage), false);
  writeMutedPreference(storage, true);
  assert.equal(data.get(MUTE_STORAGE_KEY), '1');
  assert.equal(readMutedPreference(storage), true);
  writeMutedPreference(storage, false);
  assert.equal(readMutedPreference(storage), false);
});

test('blocked storage falls back to sound on and does not throw', () => {
  const blocked = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(readMutedPreference(blocked), false);
  assert.doesNotThrow(() => writeMutedPreference(blocked, true));
  assert.equal(readMutedPreference(null), false);
  assert.doesNotThrow(() => writeMutedPreference(null, true));
});
