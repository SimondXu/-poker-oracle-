import assert from 'node:assert/strict';
import test from 'node:test';

import { getRoomPageState } from './room-page-state.ts';

const tableSnapshot = {
  activeStackPlayerCount: 2,
  activeHumanStackPlayerCount: 2,
  activeBotStackPlayerCount: 0,
  isTableFinished: false,
  canStartNextHand: true,
  isBotsOnlyContinuation: false,
  championPlayerId: null,
  championPlayerName: null,
};

test('getRoomPageState derives start controls for an active ready player', () => {
  const state = getRoomPageState(
    {
      ownerId: 'p0',
      players: [
        { id: 'p0', name: 'Alice', seatIndex: 0, stack: 1000, isBot: false, botStrategy: null, isReady: true },
        { id: 'p1', name: 'Bob', seatIndex: 1, stack: 1000, isBot: false, botStrategy: null, isReady: true },
      ],
      playerCount: 2,
      readyCount: 2,
      isPlaying: false,
      table: tableSnapshot,
    },
    'p0',
  );

  assert.equal(state.allHumansReady, true);
  assert.equal(state.hasEnoughPlayers, true);
  assert.equal(state.canSelfStart, true);
  assert.equal(state.isOwner, true);
  assert.equal(state.canStart, true);
  assert.equal(state.readyHumanCount, 2);
  assert.equal(state.activeStackPlayerCount, 2);
});

test('getRoomPageState blocks start for a ready non-owner guest', () => {
  const state = getRoomPageState(
    {
      ownerId: 'p0',
      players: [
        { id: 'p0', name: 'Alice', seatIndex: 0, stack: 1000, isBot: false, botStrategy: null, isReady: true },
        { id: 'p1', name: 'Bob', seatIndex: 1, stack: 1000, isBot: false, botStrategy: null, isReady: true },
      ],
      playerCount: 2,
      readyCount: 2,
      isPlaying: false,
      table: tableSnapshot,
    },
    'p1',
  );

  assert.equal(state.isOwner, false);
  assert.equal(state.canSelfStart, true);
  assert.equal(state.canStart, false);
});

test('getRoomPageState lets the owner start from the rail once active humans are ready', () => {
  const state = getRoomPageState(
    {
      ownerId: 'p0',
      players: [
        { id: 'p0', name: 'Alice', seatIndex: 0, stack: 0, isBot: false, botStrategy: null, isReady: false },
        { id: 'p1', name: 'Bob', seatIndex: 1, stack: 1000, isBot: false, botStrategy: null, isReady: true },
        { id: 'p2', name: 'Charlie', seatIndex: 2, stack: 1000, isBot: false, botStrategy: null, isReady: true },
      ],
      playerCount: 3,
      readyCount: 2,
      isPlaying: false,
      table: tableSnapshot,
    },
    'p0',
  );

  assert.equal(state.isOwner, true);
  assert.equal(state.canSelfStart, false);
  assert.equal(state.allHumansReady, true);
  assert.equal(state.readyHumanCount, 2);
  assert.equal(state.canStart, true);
});
