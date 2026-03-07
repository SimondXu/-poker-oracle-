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
  assert.equal(state.canStart, true);
  assert.equal(state.activeStackPlayerCount, 2);
});

test('getRoomPageState blocks start when the current player has been eliminated', () => {
  const state = getRoomPageState(
    {
      players: [
        { id: 'p0', name: 'Alice', seatIndex: 0, stack: 0, isBot: false, botStrategy: null, isReady: true },
        { id: 'p1', name: 'Bob', seatIndex: 1, stack: 1000, isBot: false, botStrategy: null, isReady: true },
      ],
      playerCount: 2,
      readyCount: 2,
      isPlaying: false,
      table: tableSnapshot,
    },
    'p0',
  );

  assert.equal(state.canSelfStart, false);
  assert.equal(state.canStart, false);
});
