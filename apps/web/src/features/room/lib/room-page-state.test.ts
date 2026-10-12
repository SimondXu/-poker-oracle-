import assert from 'node:assert/strict';
import test from 'node:test';

import { getRoomPageState, getRoomStatusKey, type RoomStatusInput } from './room-page-state.ts';

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
      hostPlayerId: 'p0',
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
      hostPlayerId: 'p0',
      table: tableSnapshot,
    },
    'p0',
  );

  assert.equal(state.canSelfStart, false);
  assert.equal(state.canStart, false);
});

test('getRoomPageState lets the only human start without pressing Ready first', () => {
  const state = getRoomPageState(
    {
      players: [
        { id: 'p0', name: 'Alice', seatIndex: 0, stack: 1000, isBot: false, botStrategy: null, isReady: false },
        { id: 'bot-1', name: 'Gus', seatIndex: 1, stack: 1000, isBot: true, botStrategy: 'lag', isReady: true },
      ],
      playerCount: 2,
      readyCount: 1,
      isPlaying: false,
      hostPlayerId: 'p0',
      table: tableSnapshot,
    },
    'p0',
  );

  assert.equal(state.isSoloHuman, true);
  assert.equal(state.canStart, true);
});

const readyToStart: RoomStatusInput = {
  isConnected: true,
  isPlaying: false,
  isTableFinished: false,
  canSelfStart: true,
  hasEnoughPlayers: true,
  isReady: true,
  allHumansReady: true,
};

test('getRoomStatusKey walks the waiting room steps in order', () => {
  assert.equal(getRoomStatusKey(readyToStart), 'lobby.room.status.canStart');
  assert.equal(getRoomStatusKey({ ...readyToStart, isConnected: false }), 'lobby.room.status.connecting');
  assert.equal(getRoomStatusKey({ ...readyToStart, hasEnoughPlayers: false }), 'lobby.room.status.needPlayers');
  assert.equal(getRoomStatusKey({ ...readyToStart, isReady: false, allHumansReady: false }), 'lobby.room.status.needReady');
  assert.equal(getRoomStatusKey({ ...readyToStart, allHumansReady: false }), 'lobby.room.status.waitOthers');
  assert.equal(getRoomStatusKey({ ...readyToStart, isPlaying: true }), 'lobby.room.status.playing');
  assert.equal(getRoomStatusKey({ ...readyToStart, canSelfStart: false }), 'lobby.room.status.eliminated');
  assert.equal(getRoomStatusKey({ ...readyToStart, isTableFinished: true }), 'lobby.room.status.finished');
});
