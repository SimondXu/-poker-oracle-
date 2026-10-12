import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getRuleBotPersonality,
  buildBotPositionMap,
  deriveBotBettingState,
  err,
  generateRoomCode,
  hasPreflopLimpers,
  isValidRoomCode,
  normalizeRoomCode,
  ok,
  ROOM_CODE_LENGTH,
} from './index.ts';

test('ok helper wraps value with success result', () => {
  const result = ok(42);
  assert.deepEqual(result, {
    ok: true,
    value: 42
  });
});

test('err helper wraps error with failure result', () => {
  const result = err('bad_action');
  assert.deepEqual(result, {
    ok: false,
    error: 'bad_action'
  });
});

test('normalizeRoomCode uppercases and strips unsupported characters', () => {
  assert.equal(normalizeRoomCode(' ab-c1o '), 'ABC1O');
});

test('isValidRoomCode accepts only canonical invite codes', () => {
  assert.equal(isValidRoomCode('ABC234'), true);
  assert.equal(isValidRoomCode('abc234'), true);
  assert.equal(isValidRoomCode('ABCD12X'), false);
  assert.equal(isValidRoomCode('ABCI23'), false);
  assert.equal(isValidRoomCode('ABO123'), false);
});

test('generateRoomCode returns a canonical invite code', () => {
  const code = generateRoomCode();
  assert.equal(code.length, ROOM_CODE_LENGTH);
  assert.equal(isValidRoomCode(code), true);
});

test('buildBotPositionMap compresses occupied seats before assigning positions', () => {
  const positions = buildBotPositionMap([0, 2, 5], 0);

  assert.equal(positions.get(0), 'btn');
  assert.equal(positions.get(2), 'sb');
  assert.equal(positions.get(5), 'bb');
});

test('hasPreflopLimpers detects passive preflop entries before any raise', () => {
  assert.equal(
    hasPreflopLimpers(
      [
        { phase: 'betting_preflop', type: 'call', toAmount: 100 },
      ],
      'betting_preflop',
      100,
    ),
    true,
  );

  assert.equal(
    hasPreflopLimpers(
      [
        { phase: 'betting_preflop', type: 'raise_to', toAmount: 300 },
        { phase: 'betting_preflop', type: 'call', toAmount: 300 },
      ],
      'betting_preflop',
      100,
    ),
    false,
  );
});

test('deriveBotBettingState separates limp pots from unopened and raised pots', () => {
  assert.equal(deriveBotBettingState(0, false), 'unopened');
  assert.equal(deriveBotBettingState(0, true), 'facing_limpers');
  assert.equal(deriveBotBettingState(1, false), 'facing_open');
  assert.equal(deriveBotBettingState(3, false), 'facing_3bet_plus');
});

test('getRuleBotPersonality extracts rule-bot personalities and ignores llm bots', () => {
  assert.equal(getRuleBotPersonality({ kind: 'rule', personality: 'tag' }), 'tag');
  assert.equal(
    getRuleBotPersonality({ kind: 'llm', model: 'claude', personaId: 'analyst' }),
    null,
  );
  assert.equal(getRuleBotPersonality(undefined), null);
});
