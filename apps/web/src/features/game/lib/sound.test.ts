import assert from 'node:assert/strict';
import test from 'node:test';

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  MASTER_VOLUME,
  MUTE_STORAGE_KEY,
  PITCH_SPREAD,
  SOUND_FILES,
  SOUND_NAMES,
  createSoundPlayer,
  playSound,
  readMutedPreference,
  writeMutedPreference,
  type AudioLike,
} from './sound.ts';

class FakeAudio implements AudioLike {
  volume = 1;
  currentTime = 5;
  playbackRate = 1;
  preservesPitch = true;
  webkitPreservesPitch = true;
  mozPreservesPitch = true;
  paused = true;
  ended = false;
  plays = 0;
  readonly src: string;
  constructor(src: string) {
    this.src = src;
  }
  onPlay: (src: string) => void = () => {};
  play() {
    this.onPlay(this.src);
    this.plays += 1;
    this.paused = false;
  }
}

function setup(state: { unlocked?: boolean; muted?: boolean; random?: () => number } = {}) {
  const made: FakeAudio[] = [];
  const log: string[] = [];
  const flags = { unlocked: state.unlocked ?? true, muted: state.muted ?? false };
  const player = createSoundPlayer({
    createAudio: (src) => {
      const audio = new FakeAudio(src);
      audio.onPlay = (played) => log.push(played);
      made.push(audio);
      return audio;
    },
    isUnlocked: () => flags.unlocked,
    isMuted: () => flags.muted,
    ...(state.random ? { random: state.random } : {}),
  });
  return { player, made, flags, log };
}

/** An rng that returns the given values in order, then the last one forever. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] as number;
};

test('plays the named file at the master volume from the start', () => {
  const { player, made } = setup({ random: () => 0 });
  player.play('raise');
  assert.equal(made.length, 1);
  assert.equal(made[0]?.src, '/sounds/raise-1.mp3');
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
  for (let i = 0; i < 5; i += 1) player.play('check');
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

test('preload creates one copy of every file, covering every variant', () => {
  const { player, made } = setup();
  player.preload();
  const expected = SOUND_NAMES.flatMap((name) => SOUND_FILES[name]).map((file) => `/sounds/${file}.mp3`);
  assert.equal(made.length, 15);
  assert.deepEqual(made.map((audio) => audio.src).sort(), expected.sort());
  assert.equal(made.every((audio) => audio.plays === 0), true);
});

test('every mapped file exists under public/sounds', () => {
  for (const name of SOUND_NAMES) {
    for (const file of SOUND_FILES[name]) {
      assert.equal(existsSync(fileURLToPath(new URL(`../../../../public/sounds/${file}.mp3`, import.meta.url))), true, file);
    }
  }
});

test('the sound-to-variant mapping', () => {
  assert.deepEqual(SOUND_FILES, {
    turn: ['turn'],
    'timer-warning': ['timer-warning'],
    check: ['check'],
    bet: ['bet-1', 'bet-2', 'bet-3'],
    raise: ['raise-1', 'raise-2', 'raise-3'],
    'all-in': ['all-in-1', 'all-in-2'],
    deal: ['deal'],
    board: ['board'],
    win: ['win-1', 'win-2'],
  });
});

test('the variant follows the rng', () => {
  const { player, made } = setup({ random: sequence(0, 0.5, 0.99, 0.5) });
  player.play('bet'); // variant draw 0 -> bet-1
  player.play('bet'); // 0.99 over the other two (bet-2, bet-3) -> bet-3
  assert.deepEqual(
    made.map((audio) => audio.src),
    ['/sounds/bet-1.mp3', '/sounds/bet-3.mp3'],
  );
});

test('a variant never repeats the one before it', () => {
  for (const name of ['bet', 'raise', 'all-in', 'win'] as const) {
    for (const draw of [0, 0.34, 0.5, 0.67, 0.999]) {
      const { player, log } = setup({ random: () => draw });
      for (let i = 0; i < 12; i += 1) player.play(name);
      assert.equal(log.length, 12);
      for (let i = 1; i < log.length; i += 1) assert.notEqual(log[i], log[i - 1], `${name} @ ${draw}`);
      assert.equal(log.every((src) => SOUND_FILES[name].some((file) => src === `/sounds/${file}.mp3`)), true);
    }
  }
});

test('every variant gets played over many plays', () => {
  const { player, log } = setup();
  for (let i = 0; i < 200; i += 1) player.play('bet');
  assert.equal(new Set(log).size, 3);
});

test('a sound with one file always plays it', () => {
  const { player, made } = setup({ random: () => 0.9 });
  player.play('check');
  (made[0] as FakeAudio).paused = true;
  player.play('check');
  assert.equal(made.length, 1);
  assert.equal(made[0]?.plays, 2);
});

test('pitch is the rng mapped onto 1 +/- 3% with pitch preservation off', () => {
  const rates: number[] = [];
  for (const draw of [0, 0.25, 0.5, 0.999999]) {
    const { player, made } = setup({ random: sequence(0, draw) });
    player.play('check');
    const audio = made[0] as FakeAudio;
    rates.push(audio.playbackRate);
    assert.equal(audio.preservesPitch, false);
    assert.equal(audio.webkitPreservesPitch, false);
    assert.equal(audio.mozPreservesPitch, false);
  }
  assert.equal(rates[0], 1 - PITCH_SPREAD);
  assert.ok(Math.abs((rates[1] as number) - 0.985) < 1e-9);
  assert.ok(Math.abs((rates[2] as number) - 1) < 1e-9);
  assert.ok((rates[3] as number) < 1.03 && (rates[3] as number) > 1.0299);
});

test('with the real rng the rate stays within [0.97, 1.03]', () => {
  const { player, made } = setup();
  for (let i = 0; i < 200; i += 1) {
    player.play('bet');
    for (const audio of made) {
      assert.ok(audio.playbackRate >= 0.97 && audio.playbackRate <= 1.03);
    }
  }
});

test('a blocked or throwing play never reaches the caller', async () => {
  const rejected = createSoundPlayer({
    createAudio: () => ({ volume: 0, currentTime: 0, playbackRate: 1, paused: true, ended: false, play: () => Promise.reject(new Error('NotAllowedError')) }),
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
