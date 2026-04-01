import assert from 'node:assert/strict';
import test from 'node:test';

import type { BotDecisionContext } from '@aipoker/shared';

import {
  getSkillDefinition,
  resolveActionPlan,
  selectCandidateSkills,
  type AgentActionPlan,
} from './index.ts';

function makeContext(overrides: Partial<BotDecisionContext> = {}): BotDecisionContext {
  return {
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 100,
    canRaise: true,
    minRaiseTo: 200,
    maxRaiseTo: 2_000,
    canAllIn: true,
    phase: 'preflop',
    potTotal: 150,
    myStack: 1_900,
    myStreetCommitted: 0,
    currentBetToMatch: 100,
    lastFullRaiseSize: 100,
    bigBlind: 100,
    smallBlind: 50,
    preflopLimpersCount: 0,
    streetActionCount: 0,
    holeCards: ['Ah', 'Kh'],
    communityCards: [],
    activePlayerCount: 6,
    opponentCount: 5,
    position: 'btn',
    effectiveStack: 6_000,
    effectiveStackBb: 60,
    spr: 10,
    bettingState: 'unopened',
    isPreflopAggressor: false,
    isLastStreetAggressor: false,
    ...overrides,
  };
}

function makeActionPlan(overrides: Partial<AgentActionPlan> = {}): AgentActionPlan {
  return {
    skillId: 'preflop_open',
    intent: 'raise',
    sizePreset: 'open_2_5bb',
    confidence: 0.82,
    reasoning: {
      situation: 'Button unopened preflop',
      analysis: 'Strong hand with fold equity.',
      decision: 'Open for a standard size.',
      alternativeConsidered: 'Flatting would under-realize initiative.',
    },
    ...overrides,
  };
}

test('short-stack push-fold is exclusive and suppresses standard preflop skills', () => {
  const skills = selectCandidateSkills(
    makeContext({
      phase: 'preflop',
      bettingState: 'unopened',
      effectiveStackBb: 9,
      canAllIn: true,
    }),
  );

  assert.deepEqual(skills.map((skill) => skill.id), ['short_stack_push_fold']);
});

test('limped preflop pots select iso-raise skills instead of unopened ranges', () => {
  const skills = selectCandidateSkills(
    makeContext({
      phase: 'preflop',
      bettingState: 'facing_limpers',
      preflopLimpersCount: 2,
    }),
  );

  assert.equal(skills[0]?.id, 'preflop_iso');
  assert.ok(skills.every((skill) => skill.id !== 'preflop_open'));
});

test('river bluff-catch ranks ahead of generic facing-bet fallback on large calls', () => {
  const skills = selectCandidateSkills(
    makeContext({
      phase: 'river',
      bettingState: 'facing_open',
      canCheck: false,
      callAmount: 80,
      potTotal: 120,
      spr: 1.8,
    }),
  );

  assert.equal(skills[0]?.id, 'river_bluff_catch');
  assert.ok(skills.some((skill) => skill.id === 'river_facing_bet'));
});

test('pot-control only appears on later streets when checking is available and aggressor role is absent', () => {
  const skills = selectCandidateSkills(
    makeContext({
      phase: 'turn',
      canCheck: true,
      canCall: false,
      callAmount: 0,
      bettingState: 'unopened',
      spr: 4.5,
      isPreflopAggressor: false,
    }),
  );

  assert.ok(skills.some((skill) => skill.id === 'pot_control'));
});

test('resolveActionPlan maps standard preflop open presets into legal raise_to actions', () => {
  const result = resolveActionPlan(
    makeContext({
      phase: 'preflop',
      currentBetToMatch: 100,
      minRaiseTo: 200,
      maxRaiseTo: 500,
    }),
    getSkillDefinition('preflop_open'),
    makeActionPlan(),
  );

  assert.deepEqual(result, {
    ok: true,
    value: { type: 'raise_to', amount: 250 },
  });
});

test('resolveActionPlan clamps computed raise sizes into the legal window', () => {
  const result = resolveActionPlan(
    makeContext({
      phase: 'preflop',
      minRaiseTo: 300,
      maxRaiseTo: 325,
    }),
    getSkillDefinition('preflop_open'),
    makeActionPlan({
      sizePreset: 'open_2_2bb',
    }),
  );

  assert.deepEqual(result, {
    ok: true,
    value: { type: 'raise_to', amount: 300 },
  });
});

test('resolveActionPlan converts jam presets into all_in actions', () => {
  const result = resolveActionPlan(
    makeContext({
      maxRaiseTo: 1_900,
      canAllIn: true,
    }),
    getSkillDefinition('short_stack_push_fold'),
    makeActionPlan({
      skillId: 'short_stack_push_fold',
      intent: 'all_in',
      sizePreset: 'jam',
    }),
  );

  assert.deepEqual(result, {
    ok: true,
    value: { type: 'all_in' },
  });
});

test('resolveActionPlan rejects size presets that are outside the selected skill constraints', () => {
  const result = resolveActionPlan(
    makeContext(),
    getSkillDefinition('preflop_open'),
    makeActionPlan({
      sizePreset: 'bet_75',
    }),
  );

  assert.deepEqual(result, {
    ok: false,
    error: 'invalid_size_preset',
  });
});
