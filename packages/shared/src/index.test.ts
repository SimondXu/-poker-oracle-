import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyAction,
  getRuleBotPersonality,
  gradeDecision,
  type CoachAdvice,
  type CoachHeroAction,
  type CoachOption,
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

test('classifyAction names actions as the hero sees them', () => {
  const opened = { currentBetToMatch: 100, myStreetCommitted: 0, myStack: 1_000 };
  assert.equal(classifyAction({ type: 'raise_to' }, { ...opened, currentBetToMatch: 0 }), 'bet');
  assert.equal(classifyAction({ type: 'raise_to' }, opened), 'raise');
  assert.equal(classifyAction({ type: 'all_in' }, opened), 'all_in');
  // All-in for no more than the bet to match is a call.
  assert.equal(classifyAction({ type: 'all_in' }, { ...opened, currentBetToMatch: 1_500 }), 'call');
  assert.equal(classifyAction({ type: 'all_in' }, { ...opened, currentBetToMatch: 1_000 }), 'call');
  assert.equal(classifyAction({ type: 'fold' }, opened), 'fold');
});

function adviceWith(options: Array<Pick<CoachOption, 'kind' | 'frequency'> & { to?: number }>, stable = true): CoachAdvice {
  return { stable, options: options.map((option) => ({ reasons: [], ...option })) } as unknown as CoachAdvice;
}

test('gradeDecision grades the hero against the policy\'s options', () => {
  const callOrRaise = adviceWith([{ kind: 'raise', to: 120, frequency: 0.75 }, { kind: 'call', frequency: 0.25 }]);
  const mostlyCall = adviceWith([{ kind: 'call', frequency: 0.76 }, { kind: 'fold', frequency: 0.24 }]);
  const twoSizes = adviceWith([{ kind: 'check', frequency: 0.6 }, { kind: 'bet', to: 40, frequency: 0.2 }, { kind: 'bet', to: 80, frequency: 0.2 }]);
  const unstable = adviceWith([{ kind: 'bet', to: 60, frequency: 0.9 }, { kind: 'check', frequency: 0.1 }], false);
  const cases: Array<[string, CoachAdvice, { kind: CoachOption['kind']; to?: number }, string]> = [
    ['an option played 25% of the time matches', callOrRaise, { kind: 'call' }, 'matched'],
    ['an option played under 25% is close', mostlyCall, { kind: 'fold' }, 'close'],
    ['the top option matches', mostlyCall, { kind: 'call' }, 'matched'],
    ['a raise 50% over the policy\'s size matches', callOrRaise, { kind: 'raise', to: 180 }, 'matched'],
    ['a raise 50% under the policy\'s size matches', callOrRaise, { kind: 'raise', to: 60 }, 'matched'],
    ['a raise more than 50% over is close', callOrRaise, { kind: 'raise', to: 181 }, 'close'],
    ['a raise more than 50% under is close', callOrRaise, { kind: 'raise', to: 59 }, 'close'],
    ['sizes of the same kind add up: 40% within range of both', twoSizes, { kind: 'bet', to: 60 }, 'matched'],
    ['only the sizes within range count: 20%', twoSizes, { kind: 'bet', to: 110 }, 'close'],
    ['an action the policy never takes is off', mostlyCall, { kind: 'raise', to: 200 }, 'off'],
    ['an all-in where the policy only calls is off', mostlyCall, { kind: 'all_in', to: 1_000 }, 'off'],
    ['unstable advice: the second option is close', unstable, { kind: 'check' }, 'close'],
    ['unstable advice: even an action outside it is close, not off', unstable, { kind: 'fold' }, 'close'],
  ];
  for (const [name, advice, hero, verdict] of cases) {
    assert.equal(gradeDecision(advice, hero), verdict, name);
  }
});

test('gradeDecision grades an all-in that only calls as a call, and a timeout like any action', () => {
  const facingShove = adviceWith([{ kind: 'call', frequency: 0.6 }, { kind: 'fold', frequency: 0.4 }]);
  const kind = classifyAction({ type: 'all_in' }, { currentBetToMatch: 500, myStreetCommitted: 100, myStack: 300 });
  assert.equal(kind, 'call');
  assert.equal(gradeDecision(facingShove, { kind }), 'matched');

  // The timeout's check or fold is graded on its merits; the review flags the source separately.
  const timedOut: CoachHeroAction = { kind: 'fold', source: 'timeout' };
  assert.equal(gradeDecision(facingShove, timedOut), 'matched');
  assert.equal(gradeDecision(adviceWith([{ kind: 'call', frequency: 1 }]), { kind: 'fold' }), 'off');
});
