import type { BotDecisionContext } from '@aipoker/shared';

import type {
  ActionSizePreset,
  AgentActionPlan,
  AgentSkillDefinition,
  ResolveActionPlanResult,
} from './types.ts';

function clampRaiseTo(context: BotDecisionContext, raiseTo: number): number {
  return Math.max(context.minRaiseTo, Math.min(context.maxRaiseTo, Math.round(raiseTo)));
}

function resolveRaiseToFromPreset(context: BotDecisionContext, preset: ActionSizePreset): number {
  switch (preset) {
    case 'open_2_2bb':
      return context.bigBlind * 2.2;
    case 'open_2_5bb':
      return context.bigBlind * 2.5;
    case 'open_3bb':
      return context.bigBlind * 3;
    case 'iso_4bb_plus_1':
      return context.bigBlind * (4 + context.preflopLimpersCount);
    case 'three_bet_3x':
      return context.currentBetToMatch * 3;
    case 'three_bet_4x':
      return context.currentBetToMatch * 4;
    case 'bet_33':
      return context.myStreetCommitted + context.potTotal * 0.33;
    case 'bet_50':
      return context.myStreetCommitted + context.potTotal * 0.5;
    case 'bet_75':
      return context.myStreetCommitted + context.potTotal * 0.75;
    case 'bet_100':
      return context.myStreetCommitted + context.potTotal;
    case 'raise_min':
      return context.minRaiseTo;
    case 'raise_2_5x':
      return context.myStreetCommitted + context.callAmount * 2.5;
    case 'raise_3x':
      return context.myStreetCommitted + context.callAmount * 3;
    case 'jam':
      return context.maxRaiseTo;
  }
}

export function resolveActionPlan(
  context: BotDecisionContext,
  skill: AgentSkillDefinition,
  actionPlan: AgentActionPlan,
): ResolveActionPlanResult {
  if (actionPlan.skillId !== skill.id) {
    return { ok: false, error: 'skill_mismatch' };
  }

  if (!skill.allowedIntents.includes(actionPlan.intent)) {
    return { ok: false, error: 'invalid_intent' };
  }

  switch (actionPlan.intent) {
    case 'fold':
      return { ok: true, value: { type: 'fold' } };
    case 'check':
      return { ok: true, value: { type: 'check' } };
    case 'call':
      return { ok: true, value: { type: 'call' } };
    case 'all_in':
      return { ok: true, value: { type: 'all_in' } };
    case 'raise': {
      if (!actionPlan.sizePreset) {
        return { ok: false, error: 'missing_size_preset' };
      }

      if (!skill.allowedSizePresets.includes(actionPlan.sizePreset)) {
        return { ok: false, error: 'invalid_size_preset' };
      }

      if (actionPlan.sizePreset === 'jam') {
        return context.canAllIn
          ? { ok: true, value: { type: 'all_in' } }
          : { ok: true, value: { type: 'raise_to', amount: context.maxRaiseTo } };
      }

      return {
        ok: true,
        value: {
          type: 'raise_to',
          amount: clampRaiseTo(context, resolveRaiseToFromPreset(context, actionPlan.sizePreset)),
        },
      };
    }
  }
}
