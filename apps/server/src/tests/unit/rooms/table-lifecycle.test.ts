import assert from 'node:assert/strict';
import test from 'node:test';

import { getTableLifecycleSnapshot } from '../../../rooms/table-lifecycle.ts';
import type { RuntimeRoom } from '../../../rooms/types.ts';

interface RoomPlayerSeed {
  stack: number;
  isBot?: boolean;
}

function createRoom(input: { handNumber: number; players: RoomPlayerSeed[] }): RuntimeRoom {
  const players = new Map(
    input.players.map((seed, index) => [
      `p${index}`,
      {
        id: `p${index}`,
        name: `P${index}`,
        seatIndex: index,
        stack: seed.stack,
        isBot: seed.isBot === true,
      },
    ]),
  );

  return {
    id: 'room-lifecycle-test',
    stateVersion: 0,
    handNumber: input.handNumber,
    smallBlind: 10,
    bigBlind: 20,
    actionTimeoutMs: 30_000,
    players,
    readyPlayerIds: new Set(),
    pendingDisconnectPlayerIds: new Set(),
    hand: null,
    lastActionSeqByPlayer: new Map(),
    lastBroadcastActionCount: 0,
  };
}

test('table lifecycle: pre-game single stack player is not finished', () => {
  const room = createRoom({ handNumber: 0, players: [{ stack: 1000 }] });
  const lifecycle = getTableLifecycleSnapshot(room);

  assert.equal(lifecycle.activeStackPlayerCount, 1);
  assert.equal(lifecycle.activeHumanStackPlayerCount, 1);
  assert.equal(lifecycle.activeBotStackPlayerCount, 0);
  assert.equal(lifecycle.isBotsOnlyContinuation, false);
  assert.equal(lifecycle.isTableFinished, false);
  assert.equal(lifecycle.canStartNextHand, false);
  assert.equal(lifecycle.championPlayerId, null);
  assert.equal(lifecycle.championPlayerName, null);
});

test('table lifecycle: finished when only one stack player remains after at least one hand', () => {
  const room = createRoom({
    handNumber: 5,
    players: [{ stack: 2400 }, { stack: 0 }, { stack: 0 }],
  });
  const lifecycle = getTableLifecycleSnapshot(room);

  assert.equal(lifecycle.activeStackPlayerCount, 1);
  assert.equal(lifecycle.activeHumanStackPlayerCount, 1);
  assert.equal(lifecycle.activeBotStackPlayerCount, 0);
  assert.equal(lifecycle.isBotsOnlyContinuation, false);
  assert.equal(lifecycle.isTableFinished, true);
  assert.equal(lifecycle.canStartNextHand, false);
  assert.equal(lifecycle.championPlayerId, 'p0');
  assert.equal(lifecycle.championPlayerName, 'P0');
});

test('table lifecycle: can start next hand when two or more stack players remain', () => {
  const room = createRoom({
    handNumber: 3,
    players: [{ stack: 1200 }, { stack: 800 }, { stack: 0 }],
  });
  const lifecycle = getTableLifecycleSnapshot(room);

  assert.equal(lifecycle.activeStackPlayerCount, 2);
  assert.equal(lifecycle.activeHumanStackPlayerCount, 2);
  assert.equal(lifecycle.activeBotStackPlayerCount, 0);
  assert.equal(lifecycle.isBotsOnlyContinuation, false);
  assert.equal(lifecycle.isTableFinished, false);
  assert.equal(lifecycle.canStartNextHand, true);
  assert.equal(lifecycle.championPlayerId, null);
  assert.equal(lifecycle.championPlayerName, null);
});

test('table lifecycle: bots-only continuation when no active humans remain', () => {
  const room = createRoom({
    handNumber: 7,
    players: [{ stack: 0 }, { stack: 900, isBot: true }, { stack: 1100, isBot: true }],
  });
  const lifecycle = getTableLifecycleSnapshot(room);

  assert.equal(lifecycle.activeStackPlayerCount, 2);
  assert.equal(lifecycle.activeHumanStackPlayerCount, 0);
  assert.equal(lifecycle.activeBotStackPlayerCount, 2);
  assert.equal(lifecycle.canStartNextHand, true);
  assert.equal(lifecycle.isBotsOnlyContinuation, true);
  assert.equal(lifecycle.isTableFinished, false);
});

test('table lifecycle: pending disconnect players do not count as active stacks', () => {
  const room = createRoom({
    handNumber: 9,
    players: [{ stack: 1000 }, { stack: 1200, isBot: true }, { stack: 900, isBot: true }],
  });
  room.pendingDisconnectPlayerIds.add('p0');

  const lifecycle = getTableLifecycleSnapshot(room);

  assert.equal(lifecycle.activeStackPlayerCount, 2);
  assert.equal(lifecycle.activeHumanStackPlayerCount, 0);
  assert.equal(lifecycle.activeBotStackPlayerCount, 2);
  assert.equal(lifecycle.isBotsOnlyContinuation, true);
});
