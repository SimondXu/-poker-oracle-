import assert from 'node:assert/strict';
import test from 'node:test';

import { getPlayerAvatarMeta } from './player-avatar.ts';

test('maps the hero player to the shared human avatar asset', () => {
  assert.deepEqual(
    getPlayerAvatarMeta({ name: 'Alice', isBot: false, botStrategy: null, isHeroPlayer: true }),
    {
      src: '/avatars/player-human.svg',
      alt: 'Alice avatar',
      fallbackLabel: 'A',
    },
  );
});

test('keeps non-hero human players on their initial fallback', () => {
  assert.deepEqual(
    getPlayerAvatarMeta({ name: 'Bob', isBot: false, botStrategy: null, isHeroPlayer: false }),
    {
      src: null,
      alt: null,
      fallbackLabel: 'B',
    },
  );
});

test('maps each bot personality to its dedicated avatar asset', () => {
  assert.deepEqual(
    getPlayerAvatarMeta({ name: 'Fish Bot 1', isBot: true, botStrategy: 'fish' }),
    {
      src: '/avatars/bot-fish.svg',
      alt: 'Fish Bot 1 avatar',
      fallbackLabel: 'F',
    },
  );

  assert.deepEqual(
    getPlayerAvatarMeta({ name: 'TAG Bot 2', isBot: true, botStrategy: 'tag' }),
    {
      src: '/avatars/bot-tag.svg',
      alt: 'TAG Bot 2 avatar',
      fallbackLabel: 'T',
    },
  );

  assert.deepEqual(
    getPlayerAvatarMeta({ name: 'LAG Bot 3', isBot: true, botStrategy: 'lag' }),
    {
      src: '/avatars/bot-lag.svg',
      alt: 'LAG Bot 3 avatar',
      fallbackLabel: 'L',
    },
  );
});

test('falls back to the generic bot avatar when strategy is unknown', () => {
  assert.deepEqual(
    getPlayerAvatarMeta({ name: 'Mystery Bot', isBot: true, botStrategy: null }),
    {
      src: '/avatars/bot-default.svg',
      alt: 'Mystery Bot avatar',
      fallbackLabel: 'M',
    },
  );
});
