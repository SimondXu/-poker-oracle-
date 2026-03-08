import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAction, initializeHand } from '@aipoker/game-engine';

import { buildBotDecisionContext, getNextButtonMarkerSeat } from '../../../game-loop/bot-support.ts';
import type { RuntimeRoom } from '../../../rooms/types.ts';

function createRoom(hand: RuntimeRoom['hand']): RuntimeRoom {
  return {
    id: 'room-bot-support',
    stateVersion: 0,
    handNumber: hand ? 1 : 0,
    smallBlind: 50,
    bigBlind: 100,
    actionTimeoutMs: 30_000,
    players: new Map([
      ['human-1', { id: 'human-1', name: 'Human', seatIndex: 0, stack: 950, isBot: false }],
      ['bot-1', { id: 'bot-1', name: 'Bot', seatIndex: 1, stack: 900, isBot: true, botStrategy: 'fish' }],
      ['bot-2', { id: 'bot-2', name: 'Bot 2', seatIndex: 2, stack: 300, isBot: true, botStrategy: 'tag' }],
    ]),
    readyPlayerIds: new Set(['human-1', 'bot-1', 'bot-2']),
    pendingDisconnectPlayerIds: new Set(),
    hand,
    lastActionSeqByPlayer: new Map(),
    lastBroadcastActionCount: 0,
    lastButtonMarkerSeat: 0,
  };
}

test('buildBotDecisionContext uses live hand potTotal instead of settled pots', () => {
  const initialized = initializeHand({
    players: [
      { id: 'human-1', seatIndex: 0, stack: 1000 },
      { id: 'bot-1', seatIndex: 1, stack: 1000 },
    ],
    buttonMarkerSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    rng: () => 0.5,
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const advanced = applyAction(initialized.value, { playerId: 'human-1', type: 'call' }, { timestamp: 1 });
  assert.equal(advanced.ok, true);
  if (!advanced.ok) return;

  assert.equal(advanced.value.potTotal, 200);
  assert.equal(advanced.value.pots.length, 0);

  const room = createRoom(advanced.value);
  const context = buildBotDecisionContext(room, 'bot-1');

  assert.ok(context);
  assert.equal(context?.potTotal, 200);
  assert.equal(context?.callAmount, 0);
});

test('getNextButtonMarkerSeat skips busted seats and wraps around the table', () => {
  const room = createRoom(null);

  room.players.get('human-1')!.stack = 500;
  room.players.get('bot-1')!.stack = 0;
  room.players.get('bot-2')!.stack = 300;
  room.lastButtonMarkerSeat = 0;

  assert.equal(getNextButtonMarkerSeat(room), 2);

  room.lastButtonMarkerSeat = 2;
  assert.equal(getNextButtonMarkerSeat(room), 0);
});

test('buildBotDecisionContext maps position and betting state from the live hand', () => {
  const initialized = initializeHand({
    players: [
      { id: 'human-1', seatIndex: 0, stack: 1000 },
      { id: 'bot-1', seatIndex: 1, stack: 1000 },
      { id: 'bot-2', seatIndex: 2, stack: 1000 },
      { id: 'bot-3', seatIndex: 3, stack: 1000 },
    ],
    buttonMarkerSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    rng: () => 0.5,
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const unopenedRoom = createRoom(initialized.value);
  unopenedRoom.players.set('bot-3', {
    id: 'bot-3',
    name: 'Bot 3',
    seatIndex: 3,
    stack: 1000,
    isBot: true,
    botStrategy: 'lag',
  });
  const unopenedContext = buildBotDecisionContext(unopenedRoom, 'bot-3');

  assert.ok(unopenedContext);
  assert.equal(unopenedContext?.position, 'utg');
  assert.equal(unopenedContext?.bettingState, 'unopened');
  assert.equal(unopenedContext?.activePlayerCount, 4);
  assert.equal(unopenedContext?.opponentCount, 3);

  const raised = applyAction(initialized.value, { playerId: 'bot-3', type: 'raise_to', amount: 300 }, { timestamp: 1 });
  assert.equal(raised.ok, true);
  if (!raised.ok) return;

  const facingOpenRoom = createRoom(raised.value);
  facingOpenRoom.players.set('bot-3', {
    id: 'bot-3',
    name: 'Bot 3',
    seatIndex: 3,
    stack: 700,
    isBot: true,
    botStrategy: 'lag',
  });
  const facingOpenContext = buildBotDecisionContext(facingOpenRoom, 'human-1');

  assert.ok(facingOpenContext);
  assert.equal(facingOpenContext?.position, 'btn');
  assert.equal(facingOpenContext?.bettingState, 'facing_open');
  assert.equal(facingOpenContext?.isPreflopAggressor, false);
});
