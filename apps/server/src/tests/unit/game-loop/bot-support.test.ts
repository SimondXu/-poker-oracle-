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
      ['bot-1', { id: 'bot-1', name: 'Bot', seatIndex: 1, stack: 900, isBot: true, botConfig: { kind: 'rule', personality: 'fish' } }],
      ['bot-2', { id: 'bot-2', name: 'Bot 2', seatIndex: 2, stack: 300, isBot: true, botConfig: { kind: 'rule', personality: 'tag' } }],
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
    botConfig: { kind: 'rule', personality: 'lag' },
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
    botConfig: { kind: 'rule', personality: 'lag' },
  });
  const facingOpenContext = buildBotDecisionContext(facingOpenRoom, 'human-1');

  assert.ok(facingOpenContext);
  assert.equal(facingOpenContext?.position, 'btn');
  assert.equal(facingOpenContext?.bettingState, 'facing_open');
  assert.equal(facingOpenContext?.isPreflopAggressor, false);
});

test('buildBotDecisionContext keeps 3-handed preflop seat count after one player folds', () => {
  const initialized = initializeHand({
    players: [
      { id: 'btn', seatIndex: 0, stack: 1000 },
      { id: 'sb', seatIndex: 1, stack: 1000 },
      { id: 'bb', seatIndex: 2, stack: 1000 },
    ],
    buttonMarkerSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    rng: () => 0.5,
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const limped = applyAction(initialized.value, { playerId: 'btn', type: 'call' }, { timestamp: 1 });
  assert.equal(limped.ok, true);
  if (!limped.ok) return;

  const folded = applyAction(limped.value, { playerId: 'sb', type: 'fold' }, { timestamp: 2 });
  assert.equal(folded.ok, true);
  if (!folded.ok) return;

  const raised = applyAction(folded.value, { playerId: 'bb', type: 'raise_to', amount: 300 }, { timestamp: 3 });
  assert.equal(raised.ok, true);
  if (!raised.ok) return;

  const room = createRoom(raised.value);
  room.players = new Map([
    ['btn', { id: 'btn', name: 'Button', seatIndex: 0, stack: 900, isBot: true, botConfig: { kind: 'rule', personality: 'tag' } }],
    ['sb', { id: 'sb', name: 'Small Blind', seatIndex: 1, stack: 950, isBot: false }],
    ['bb', { id: 'bb', name: 'Big Blind', seatIndex: 2, stack: 700, isBot: false }],
  ]);

  const context = buildBotDecisionContext(room, 'btn');

  assert.ok(context);
  assert.equal(context?.activePlayerCount, 3);
  assert.equal(context?.opponentCount, 1);
});

test('buildBotDecisionContext classifies limped preflop pots separately from unopened pots', () => {
  const initialized = initializeHand({
    players: [
      { id: 'btn', seatIndex: 0, stack: 1000 },
      { id: 'sb', seatIndex: 1, stack: 1000 },
      { id: 'bb', seatIndex: 2, stack: 1000 },
    ],
    buttonMarkerSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    rng: () => 0.5,
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const limped = applyAction(initialized.value, { playerId: 'btn', type: 'call' }, { timestamp: 1 });
  assert.equal(limped.ok, true);
  if (!limped.ok) return;

  const room = createRoom(limped.value);
  room.players = new Map([
    ['btn', { id: 'btn', name: 'Button', seatIndex: 0, stack: 900, isBot: false }],
    ['sb', { id: 'sb', name: 'Small Blind', seatIndex: 1, stack: 950, isBot: true, botConfig: { kind: 'rule', personality: 'tag' } }],
    ['bb', { id: 'bb', name: 'Big Blind', seatIndex: 2, stack: 900, isBot: false }],
  ]);

  const context = buildBotDecisionContext(room, 'sb');

  assert.ok(context);
  assert.equal(context?.bettingState, 'facing_limpers');
});

test('buildBotDecisionContext exposes resolver and skill-runtime sizing fields', () => {
  const initialized = initializeHand({
    players: [
      { id: 'btn', seatIndex: 0, stack: 1000 },
      { id: 'sb', seatIndex: 1, stack: 1000 },
      { id: 'bb', seatIndex: 2, stack: 1000 },
    ],
    buttonMarkerSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    rng: () => 0.5,
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const limped = applyAction(initialized.value, { playerId: 'btn', type: 'call' }, { timestamp: 1 });
  assert.equal(limped.ok, true);
  if (!limped.ok) return;

  const room = createRoom(limped.value);
  room.players = new Map([
    ['btn', { id: 'btn', name: 'Button', seatIndex: 0, stack: 900, isBot: false }],
    ['sb', { id: 'sb', name: 'Small Blind', seatIndex: 1, stack: 950, isBot: true, botConfig: { kind: 'rule', personality: 'tag' } }],
    ['bb', { id: 'bb', name: 'Big Blind', seatIndex: 2, stack: 900, isBot: false }],
  ]);

  const context = buildBotDecisionContext(room, 'sb');

  assert.ok(context);
  assert.equal(context?.smallBlind, 50);
  assert.equal(context?.bigBlind, 100);
  assert.equal(context?.myStreetCommitted, 50);
  assert.equal(context?.currentBetToMatch, 100);
  assert.equal(context?.lastFullRaiseSize, 100);
  assert.equal(context?.preflopLimpersCount, 1);
  assert.equal(context?.streetActionCount, 1);
});
