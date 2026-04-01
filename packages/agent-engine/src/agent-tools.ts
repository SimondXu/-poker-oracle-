import type { Card } from '@aipoker/shared';

import type { AgentToolSpec } from './types.ts';

const NO_ARG_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

function getPotOdds(callAmount: number, potTotal: number): number {
  if (callAmount <= 0) {
    return 0;
  }

  return Number((callAmount / (potTotal + callAmount)).toFixed(4));
}

function describeBoard(cards: Card[]): string {
  if (cards.length === 0) {
    return 'no_board';
  }

  const suits = new Set(cards.map((card) => card.at(-1) ?? ''));
  const ranks = cards.map((card) => card[0] ?? '');
  const hasBroadwayDensity = ranks.some((rank) => ['T', 'J', 'Q', 'K', 'A'].includes(rank));

  if (suits.size === 1) {
    return 'monotone';
  }
  if (suits.size === 2) {
    return hasBroadwayDensity ? 'two_tone_broadway' : 'two_tone';
  }
  if (hasBroadwayDensity) {
    return 'rainbow_broadway';
  }

  return 'rainbow';
}

export function createDefaultAgentTools(): AgentToolSpec[] {
  return [
    {
      name: 'get_preflop_mix',
      description: 'Return a simple position-aware preflop baseline for the current node.',
      inputSchema: NO_ARG_INPUT_SCHEMA,
      mode: 'realtime_and_eval',
      async execute(_args, executionContext) {
        const { context } = executionContext;
        return {
          node: context.bettingState,
          position: context.position,
          effectiveStackBb: context.effectiveStackBb,
          baseline: context.position === 'btn' ? 'open_wide' : 'open_tighter',
        };
      },
    },
    {
      name: 'get_pot_odds',
      description: 'Calculate immediate pot odds for the current call decision.',
      inputSchema: NO_ARG_INPUT_SCHEMA,
      mode: 'realtime_and_eval',
      async execute(_args, executionContext) {
        const { context } = executionContext;
        return {
          callAmount: context.callAmount,
          potTotal: context.potTotal,
          potOdds: getPotOdds(context.callAmount, context.potTotal),
        };
      },
    },
    {
      name: 'get_required_equity',
      description: 'Return the required equity threshold for a pure call.',
      inputSchema: NO_ARG_INPUT_SCHEMA,
      mode: 'realtime_and_eval',
      async execute(_args, executionContext) {
        const { context } = executionContext;
        return {
          requiredEquity: getPotOdds(context.callAmount, context.potTotal),
        };
      },
    },
    {
      name: 'analyze_postflop',
      description: 'Provide a compact board-texture and SPR summary.',
      inputSchema: NO_ARG_INPUT_SCHEMA,
      mode: 'realtime_and_eval',
      async execute(_args, executionContext) {
        const { context } = executionContext;
        return {
          street: context.phase,
          boardTexture: describeBoard(context.communityCards),
          spr: context.spr,
        };
      },
    },
    {
      name: 'get_opponent_profile',
      description: 'Return a lightweight pool-profile summary for the current table state.',
      inputSchema: NO_ARG_INPUT_SCHEMA,
      mode: 'realtime_and_eval',
      async execute(_args, executionContext) {
        const { context } = executionContext;
        return {
          opponents: context.opponentCount,
          activePlayers: context.activePlayerCount,
          poolTendency: context.opponentCount <= 2 ? 'short_handed_pressure' : 'multiway_caution',
        };
      },
    },
    {
      name: 'get_recent_history',
      description: 'Return replay/eval-only history context for debugging a decision.',
      inputSchema: NO_ARG_INPUT_SCHEMA,
      mode: 'eval_only',
      async execute(_args, executionContext) {
        return {
          memoryPrompt: executionContext.memoryPrompt || 'no_recent_history',
        };
      },
    },
    {
      name: 'get_training_analysis',
      description: 'Return eval-only heuristic training notes.',
      inputSchema: NO_ARG_INPUT_SCHEMA,
      mode: 'eval_only',
      async execute() {
        return {
          source: 'phase_1_placeholder',
          note: 'Training analysis is not yet wired to the strategy engine.',
        };
      },
    },
    {
      name: 'get_heuristic_baseline',
      description: 'Return an eval-only heuristic baseline action family.',
      inputSchema: NO_ARG_INPUT_SCHEMA,
      mode: 'eval_only',
      async execute(_args, executionContext) {
        const { context } = executionContext;
        return {
          baselineIntent: context.canCheck ? 'check' : 'fold',
        };
      },
    },
    {
      name: 'get_trace_slice',
      description: 'Return replay-only trace metadata.',
      inputSchema: NO_ARG_INPUT_SCHEMA,
      mode: 'replay_only',
      async execute() {
        return {
          trace: 'not_available_in_phase_1',
        };
      },
    },
  ];
}
