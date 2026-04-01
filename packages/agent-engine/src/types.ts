import type { BotDecisionContext } from '@aipoker/shared';

export type AgentSkillId =
  | 'preflop_open'
  | 'preflop_iso'
  | 'preflop_vs_open'
  | 'preflop_vs_3bet'
  | 'short_stack_push_fold'
  | 'flop_cbet'
  | 'flop_defend'
  | 'flop_facing_bet'
  | 'turn_barrel'
  | 'turn_facing_bet'
  | 'river_value'
  | 'river_facing_bet'
  | 'river_bluff_catch'
  | 'pot_control';

export type AgentToolName =
  | 'get_preflop_mix'
  | 'get_pot_odds'
  | 'get_required_equity'
  | 'analyze_postflop'
  | 'get_opponent_profile'
  | 'get_recent_history'
  | 'get_training_analysis'
  | 'get_heuristic_baseline'
  | 'get_trace_slice';

export type ActionIntent = 'fold' | 'check' | 'call' | 'raise' | 'all_in';

export type ActionSizePreset =
  | 'open_2_2bb'
  | 'open_2_5bb'
  | 'open_3bb'
  | 'iso_4bb_plus_1'
  | 'three_bet_3x'
  | 'three_bet_4x'
  | 'jam'
  | 'bet_33'
  | 'bet_50'
  | 'bet_75'
  | 'bet_100'
  | 'raise_min'
  | 'raise_2_5x'
  | 'raise_3x';

export interface AgentSkillDefinition {
  id: AgentSkillId;
  label: string;
  description: string;
  priority: number;
  exclusive?: boolean;
  phases: BotDecisionContext['phase'][];
  allowedTools: AgentToolName[];
  allowedIntents: ActionIntent[];
  allowedSizePresets: ActionSizePreset[];
  isApplicable: (context: BotDecisionContext) => boolean;
}

export interface AgentActionPlan {
  skillId: AgentSkillId;
  intent: ActionIntent;
  sizePreset?: ActionSizePreset;
  confidence: number;
  reasoning: {
    situation: string;
    analysis: string;
    decision: string;
    alternativeConsidered: string;
  };
}

export type AgentDecision =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise_to'; amount: number }
  | { type: 'all_in' };

export interface AgentDecisionResult {
  skillId: AgentSkillId;
  action: AgentDecision;
  confidence: number;
}

export type ResolveActionPlanResult =
  | { ok: true; value: AgentDecision }
  | {
      ok: false;
      error:
        | 'skill_mismatch'
        | 'invalid_intent'
        | 'missing_size_preset'
        | 'invalid_size_preset';
    };
