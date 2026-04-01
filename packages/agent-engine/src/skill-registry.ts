import type { BotDecisionContext } from '@aipoker/shared';

import type { AgentSkillDefinition, AgentSkillId } from './types.ts';

function isFacingBet(context: BotDecisionContext): boolean {
  return !context.canCheck && context.canCall && context.callAmount > 0;
}

function isLaterStreet(context: BotDecisionContext): boolean {
  return context.phase === 'turn' || context.phase === 'river';
}

export const AGENT_SKILLS: AgentSkillDefinition[] = [
  {
    id: 'short_stack_push_fold',
    label: 'Short Stack Push/Fold',
    description: 'Use jam-or-fold logic when shallow enough that standard raise trees lose value.',
    priority: 100,
    exclusive: true,
    phases: ['preflop'],
    allowedTools: ['get_preflop_mix', 'get_opponent_profile'],
    allowedIntents: ['fold', 'call', 'all_in'],
    allowedSizePresets: ['jam'],
    isApplicable: (context) => context.phase === 'preflop' && context.effectiveStackBb <= 12 && context.canAllIn,
  },
  {
    id: 'preflop_iso',
    label: 'Preflop Isolation',
    description: 'Punish limp-heavy pots with a sizing built for heads-up initiative.',
    priority: 80,
    phases: ['preflop'],
    allowedTools: ['get_preflop_mix', 'get_opponent_profile'],
    allowedIntents: ['fold', 'call', 'raise', 'all_in'],
    allowedSizePresets: ['iso_4bb_plus_1', 'jam'],
    isApplicable: (context) => context.phase === 'preflop' && context.bettingState === 'facing_limpers' && context.canRaise,
  },
  {
    id: 'preflop_vs_3bet',
    label: 'Preflop Vs 3-Bet',
    description: 'Handle re-raise trees separately from normal open-defense ranges.',
    priority: 75,
    phases: ['preflop'],
    allowedTools: ['get_preflop_mix', 'get_required_equity', 'get_opponent_profile'],
    allowedIntents: ['fold', 'call', 'raise', 'all_in'],
    allowedSizePresets: ['three_bet_4x', 'jam'],
    isApplicable: (context) =>
      context.phase === 'preflop'
      && (context.bettingState === 'facing_raise' || context.bettingState === 'facing_3bet_plus')
      && context.canRaise,
  },
  {
    id: 'preflop_vs_open',
    label: 'Preflop Vs Open',
    description: 'Defend or 3-bet against a single open with position-aware mixes.',
    priority: 70,
    phases: ['preflop'],
    allowedTools: ['get_preflop_mix', 'get_required_equity', 'get_opponent_profile'],
    allowedIntents: ['fold', 'call', 'raise', 'all_in'],
    allowedSizePresets: ['three_bet_3x', 'three_bet_4x', 'jam'],
    isApplicable: (context) => context.phase === 'preflop' && context.bettingState === 'facing_open',
  },
  {
    id: 'preflop_open',
    label: 'Preflop Open',
    description: 'Standard unopened preflop decision framework.',
    priority: 60,
    phases: ['preflop'],
    allowedTools: ['get_preflop_mix', 'get_opponent_profile'],
    allowedIntents: ['fold', 'raise', 'all_in'],
    allowedSizePresets: ['open_2_2bb', 'open_2_5bb', 'open_3bb', 'jam'],
    isApplicable: (context) => context.phase === 'preflop' && context.bettingState === 'unopened' && context.canRaise,
  },
  {
    id: 'flop_cbet',
    label: 'Flop C-Bet',
    description: 'Follow through in position or initiative-driven flop spots.',
    priority: 60,
    phases: ['flop'],
    allowedTools: ['analyze_postflop', 'get_pot_odds', 'get_opponent_profile'],
    allowedIntents: ['check', 'raise', 'all_in'],
    allowedSizePresets: ['bet_33', 'bet_50', 'bet_75', 'bet_100', 'jam'],
    isApplicable: (context) => context.phase === 'flop' && context.canCheck && context.isPreflopAggressor,
  },
  {
    id: 'flop_defend',
    label: 'Flop Defend',
    description: 'Check-backed flop defense framework when no bet is faced.',
    priority: 45,
    phases: ['flop'],
    allowedTools: ['analyze_postflop', 'get_opponent_profile'],
    allowedIntents: ['check', 'raise'],
    allowedSizePresets: ['bet_33', 'bet_50', 'bet_75'],
    isApplicable: (context) => context.phase === 'flop' && context.canCheck,
  },
  {
    id: 'flop_facing_bet',
    label: 'Flop Facing Bet',
    description: 'Fallback analysis for flop spots facing a live wager.',
    priority: 30,
    phases: ['flop'],
    allowedTools: ['analyze_postflop', 'get_pot_odds', 'get_required_equity', 'get_opponent_profile'],
    allowedIntents: ['fold', 'call', 'raise', 'all_in'],
    allowedSizePresets: ['raise_min', 'raise_2_5x', 'raise_3x', 'jam'],
    isApplicable: (context) => context.phase === 'flop' && isFacingBet(context),
  },
  {
    id: 'turn_barrel',
    label: 'Turn Barrel',
    description: 'Continue applying pressure after taking initiative earlier.',
    priority: 60,
    phases: ['turn'],
    allowedTools: ['analyze_postflop', 'get_opponent_profile'],
    allowedIntents: ['check', 'raise', 'all_in'],
    allowedSizePresets: ['bet_50', 'bet_75', 'bet_100', 'jam'],
    isApplicable: (context) => context.phase === 'turn' && context.canCheck && context.isLastStreetAggressor,
  },
  {
    id: 'turn_facing_bet',
    label: 'Turn Facing Bet',
    description: 'Fallback framework for turn spots facing aggression.',
    priority: 30,
    phases: ['turn'],
    allowedTools: ['analyze_postflop', 'get_pot_odds', 'get_required_equity', 'get_opponent_profile'],
    allowedIntents: ['fold', 'call', 'raise', 'all_in'],
    allowedSizePresets: ['raise_min', 'raise_2_5x', 'raise_3x', 'jam'],
    isApplicable: (context) => context.phase === 'turn' && isFacingBet(context),
  },
  {
    id: 'river_value',
    label: 'River Value',
    description: 'Thin or thick value on the final street when checked to.',
    priority: 60,
    phases: ['river'],
    allowedTools: ['analyze_postflop', 'get_opponent_profile'],
    allowedIntents: ['check', 'raise', 'all_in'],
    allowedSizePresets: ['bet_50', 'bet_75', 'bet_100', 'jam'],
    isApplicable: (context) => context.phase === 'river' && context.canCheck,
  },
  {
    id: 'river_bluff_catch',
    label: 'River Bluff Catch',
    description: 'Specialize on bluff-catching thresholds when price is severe.',
    priority: 50,
    phases: ['river'],
    allowedTools: ['analyze_postflop', 'get_pot_odds', 'get_required_equity', 'get_opponent_profile'],
    allowedIntents: ['fold', 'call'],
    allowedSizePresets: [],
    isApplicable: (context) =>
      context.phase === 'river'
      && isFacingBet(context)
      && context.callAmount > context.potTotal * 0.5,
  },
  {
    id: 'river_facing_bet',
    label: 'River Facing Bet',
    description: 'Generic river defense fallback when a bet lands in front of you.',
    priority: 30,
    phases: ['river'],
    allowedTools: ['analyze_postflop', 'get_pot_odds', 'get_required_equity', 'get_opponent_profile'],
    allowedIntents: ['fold', 'call', 'raise', 'all_in'],
    allowedSizePresets: ['raise_min', 'raise_2_5x', 'raise_3x', 'jam'],
    isApplicable: (context) => context.phase === 'river' && isFacingBet(context),
  },
  {
    id: 'pot_control',
    label: 'Pot Control',
    description: 'Preserve showdown value without bloating the pot.',
    priority: 55,
    phases: ['turn', 'river'],
    allowedTools: ['analyze_postflop', 'get_opponent_profile'],
    allowedIntents: ['check', 'call'],
    allowedSizePresets: [],
    isApplicable: (context) =>
      isLaterStreet(context)
      && context.canCheck
      && context.spr > 3
      && !context.isPreflopAggressor,
  },
];

const AGENT_SKILL_MAP = new Map<AgentSkillId, AgentSkillDefinition>(
  AGENT_SKILLS.map((skill) => [skill.id, skill]),
);

export function getSkillDefinition(skillId: AgentSkillId): AgentSkillDefinition {
  const skill = AGENT_SKILL_MAP.get(skillId);
  if (!skill) {
    throw new Error(`Unknown agent skill: ${skillId}`);
  }

  return skill;
}
