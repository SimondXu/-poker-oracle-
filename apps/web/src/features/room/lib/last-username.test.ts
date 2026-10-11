import assert from 'node:assert/strict';
import test from 'node:test';

import { LAST_USERNAME_KEY, readLastUsername, saveLastUsername } from './last-username.ts';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

test('saves a trimmed name and reads it back', () => {
  const storage = memoryStorage();
  saveLastUsername('  Simon ', storage);
  assert.equal(storage.getItem(LAST_USERNAME_KEY), 'Simon');
  assert.equal(readLastUsername(storage), 'Simon');
});

test('ignores empty names and missing values', () => {
  const storage = memoryStorage();
  saveLastUsername('   ', storage);
  assert.equal(readLastUsername(storage), null);
});

test('never throws when storage is unavailable or broken', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(readLastUsername(broken), null);
  assert.doesNotThrow(() => saveLastUsername('Simon', broken));
  assert.equal(readLastUsername(null), null);
  assert.doesNotThrow(() => saveLastUsername('Simon', null));
});
