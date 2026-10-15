import assert from 'node:assert/strict';
import test from 'node:test';

import type { RoomStateEvent } from '@aipoker/shared';

import { initialRoomSocketViewState, roomSocketViewReducer, toRoomState } from './room-socket-state.ts';

const roomState = toRoomState({
  roomId: 'AAAABA',
  stateVersion: 1,
  hostPlayerId: 'p0',
  players: [
    {
      id: 'p0',
      name: 'Alice',
      seatIndex: 0,
      stack: 1000,
      isBot: false,
      botStrategy: null,
      isReady: true,
    },
    {
      id: 'p1',
      name: 'Bob',
      seatIndex: 1,
      stack: 1000,
      isBot: false,
      botStrategy: null,
      isReady: false,
    },
  ],
  playerCount: 2,
  readyCount: 1,
  isPlaying: false,
  table: {
    activeStackPlayerCount: 2,
    activeHumanStackPlayerCount: 2,
    activeBotStackPlayerCount: 0,
    isTableFinished: false,
    canStartNextHand: true,
    isBotsOnlyContinuation: false,
    championPlayerId: null,
    championPlayerName: null,
  },
});

test('roomSocketViewReducer reset clears stale room state and flags', () => {
  const nextState = roomSocketViewReducer(
    {
      roomState,
      isConnected: true,
      isReady: true,
    },
    { type: 'reset' }
  );

  assert.deepEqual(nextState, initialRoomSocketViewState);
});

test('roomSocketViewReducer derives ready state from the current player', () => {
  const nextState = roomSocketViewReducer(initialRoomSocketViewState, {
    type: 'roomStateReceived',
    roomState,
    playerId: 'p0',
  });

  assert.deepEqual(nextState, {
    roomState,
    isConnected: false,
    isReady: true,
  });
});

test('toRoomState keeps the host so host-only controls can be gated', () => {
  assert.equal(roomState.hostPlayerId, 'p0');
});

test('toRoomState carries the Claude bot capability and a seat\'s model, and defaults to neither', () => {
  const base: RoomStateEvent = {
    roomId: 'AAAABA',
    stateVersion: 1,
    hostPlayerId: 'p0',
    players: [{ id: 'bot-claude-1', name: 'Nadia', seatIndex: 1, stack: 1000, isBot: true, botStrategy: null, botModel: 'claude-cli:claude-haiku-5-5', isReady: true }],
    playerCount: 1,
    readyCount: 1,
    isPlaying: false,
    table: roomState.table,
  };
  assert.equal(toRoomState(base).cliBots, false);
  assert.equal(toRoomState({ ...base, cliBots: true }).cliBots, true);
  assert.equal(toRoomState(base).players[0]?.botModel, 'claude-cli:claude-haiku-5-5');
});
