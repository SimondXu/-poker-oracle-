import assert from 'node:assert/strict';
import test from 'node:test';

import { getTableLifecycleSnapshot } from '../../../rooms/table-lifecycle.ts';
import type { RuntimeRoom } from '../../../rooms/types.ts';

function createRoom(input: { handNumber: number; stacks: number[] }): RuntimeRoom {
  const players = new Map(
    input.stacks.map((stack, index) => [
      `p${index}`,
      {
        id: `p${index}`,
        name: `P${index}`,
        seatIndex: index,
        stack,
        isBot: false as const,
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
  const room = createRoom({ handNumber: 0, stacks: [1000] });
  const lifecycle = getTableLifecycleSnapshot(room);

  assert.equal(lifecycle.activeStackPlayerCount, 1);
  assert.equal(lifecycle.isTableFinished, false);
  assert.equal(lifecycle.canStartNextHand, false);
  assert.equal(lifecycle.championPlayerId, null);
  assert.equal(lifecycle.championPlayerName, null);
});

test('table lifecycle: finished when only one stack player remains after at least one hand', () => {
  const room = createRoom({ handNumber: 5, stacks: [2400, 0, 0] });
  const lifecycle = getTableLifecycleSnapshot(room);

  assert.equal(lifecycle.activeStackPlayerCount, 1);
  assert.equal(lifecycle.isTableFinished, true);
  assert.equal(lifecycle.canStartNextHand, false);
  assert.equal(lifecycle.championPlayerId, 'p0');
  assert.equal(lifecycle.championPlayerName, 'P0');
});

test('table lifecycle: can start next hand when two or more stack players remain', () => {
  const room = createRoom({ handNumber: 3, stacks: [1200, 800, 0] });
  const lifecycle = getTableLifecycleSnapshot(room);

  assert.equal(lifecycle.activeStackPlayerCount, 2);
  assert.equal(lifecycle.isTableFinished, false);
  assert.equal(lifecycle.canStartNextHand, true);
  assert.equal(lifecycle.championPlayerId, null);
  assert.equal(lifecycle.championPlayerName, null);
});
