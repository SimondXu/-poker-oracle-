import type { BotDecisionContext } from '@aipoker/shared';

function formatPreflopEnvelope(context: BotDecisionContext): string {
  return [
    `position=${context.position}`,
    `betting_state=${context.bettingState}`,
    `effective_stack_bb=${context.effectiveStackBb.toFixed(1)}`,
    `limpers=${context.preflopLimpersCount}`,
    `call_amount=${context.callAmount}`,
  ].join(', ');
}

export const PREFLOP_SKILL_INSTRUCTIONS = {
  short_stack_push_fold: (context: BotDecisionContext) =>
    [
      'Short Stack Push/Fold',
      'Use a jam-or-fold framework and avoid mixing standard raise sizes.',
      `Context: ${formatPreflopEnvelope(context)}`,
      'Only continue with call or all-in when the hand clears the shallow-stack threshold.',
    ].join('\n'),
  preflop_iso: (context: BotDecisionContext) =>
    [
      'Preflop Isolation',
      'Attack limpers with initiative-driven sizings that punish capped ranges.',
      `Context: ${formatPreflopEnvelope(context)}`,
      'Prefer iso raises over passive flats when the hand benefits from heads-up play.',
    ].join('\n'),
  preflop_vs_3bet: (context: BotDecisionContext) =>
    [
      'Preflop Vs 3-Bet',
      'Treat this as a re-raise tree, not a normal open-defense node.',
      `Context: ${formatPreflopEnvelope(context)}`,
      'Respect stack depth and only continue with hands that can realize equity or jam profitably.',
    ].join('\n'),
  preflop_vs_open: (context: BotDecisionContext) =>
    [
      'Preflop Vs Open',
      'Choose between fold, call, and 3-bet with position and opener pressure in mind.',
      `Context: ${formatPreflopEnvelope(context)}`,
      'Use polar 3-bets and avoid dominated flatting when out of position.',
    ].join('\n'),
  preflop_open: (context: BotDecisionContext) =>
    [
      'Preflop Open',
      'Apply the unopened preflop framework and favor raise-first play.',
      `Context: ${formatPreflopEnvelope(context)}`,
      'Use standard open sizes unless shallow-stack jam is clearly superior.',
    ].join('\n'),
} as const;
