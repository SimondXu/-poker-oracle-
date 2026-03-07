import assert from 'node:assert/strict';
import test from 'node:test';

import { canRequestNextHand, mapHandResultToStore } from './game-socket-controller.ts';

test('mapHandResultToStore aggregates payouts by player and keeps winner ids stable', () => {
  const mapped = mapHandResultToStore({
    result: {
      roomId: 'AAAABA',
      phase: 'hand_end',
      potTotal: 600,
      pots: [],
      payouts: [
        { potIndex: 0, playerId: 'p0', amount: 400 },
        { potIndex: 1, playerId: 'p0', amount: 200 },
      ],
      players: [
        { id: 'p0', name: 'Alice', stack: 1200, status: 'active', holeCards: ['As', 'Ad'] },
      ],
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
      stateVersion: 7,
    },
    currentHand: {
      id: 'hand-1',
      roomId: 'AAAABA',
      handNumber: 3,
      phase: 'hand_end',
      maxSeats: 6,
      smallBlind: 10,
      bigBlind: 20,
      buttonMarkerSeat: 0,
      sbSeat: 0,
      bbSeat: 1,
      players: [
        {
          id: 'p0',
          name: 'Alice',
          seatIndex: 0,
          stack: 1200,
          streetCommitted: 0,
          handCommitted: 0,
          status: 'active',
          holeCards: ['As', 'Ad'],
          isBot: false,
          hasActedThisStreet: true,
          matchedBetToMatchAtLastAction: 20,
        },
      ],
      communityCards: ['Kh', 'Qh', '2c', '7d', '9s'],
      pots: [],
      betting: {
        currentBetToMatch: 0,
        lastFullRaiseSize: 20,
        lastAggressorId: null,
      },
      currentActorSeat: null,
      actions: [],
    },
  });

  assert.deepEqual(mapped.winnerIds, ['p0']);
  assert.equal(mapped.payouts.length, 1);
  assert.equal(mapped.payouts[0]?.amount, 600);
});

test('canRequestNextHand guards disabled or duplicate requests', () => {
  assert.equal(canRequestNextHand({ enabled: true, roomId: 'AAAABA', nextHandRequested: false }), true);
  assert.equal(canRequestNextHand({ enabled: false, roomId: 'AAAABA', nextHandRequested: false }), false);
  assert.equal(canRequestNextHand({ enabled: true, roomId: '', nextHandRequested: false }), false);
  assert.equal(canRequestNextHand({ enabled: true, roomId: 'AAAABA', nextHandRequested: true }), false);
});
