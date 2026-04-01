import type { BotDecisionContext } from '@aipoker/shared';

function formatPostflopEnvelope(context: BotDecisionContext): string {
  return [
    `phase=${context.phase}`,
    `spr=${context.spr.toFixed(2)}`,
    `pot_total=${context.potTotal}`,
    `call_amount=${context.callAmount}`,
    `board=${context.communityCards.join(' ') || 'none'}`,
    `aggressor=${context.isLastStreetAggressor || context.isPreflopAggressor ? 'yes' : 'no'}`,
  ].join(', ');
}

export const POSTFLOP_SKILL_INSTRUCTIONS = {
  flop_cbet: (context: BotDecisionContext) =>
    [
      'Flop C-Bet',
      'Use initiative to pressure capped ranges while preserving range advantage discipline.',
      `Context: ${formatPostflopEnvelope(context)}`,
      'Prefer simple c-bet sizes tied to board texture and equity denial needs.',
    ].join('\n'),
  flop_defend: (context: BotDecisionContext) =>
    [
      'Flop Defend',
      'No bet is faced. Choose disciplined checks and selective probes only when justified.',
      `Context: ${formatPostflopEnvelope(context)}`,
      'Avoid over-bluffing when the checking range should stay protected.',
    ].join('\n'),
  flop_facing_bet: (context: BotDecisionContext) =>
    [
      'Flop Facing Bet',
      'Evaluate pot odds, equity realization, and raising incentives against live aggression.',
      `Context: ${formatPostflopEnvelope(context)}`,
      'Use calls for robust continues and raises when fold equity plus equity realization justify it.',
    ].join('\n'),
  turn_barrel: (context: BotDecisionContext) =>
    [
      'Turn Barrel',
      'Continue pressure only when your range and blocker story support a second barrel.',
      `Context: ${formatPostflopEnvelope(context)}`,
      'Check back medium-strength hands that do not benefit from inflating the pot.',
    ].join('\n'),
  turn_facing_bet: (context: BotDecisionContext) =>
    [
      'Turn Facing Bet',
      'Respond to turn aggression with narrower continues than on the flop.',
      `Context: ${formatPostflopEnvelope(context)}`,
      'Avoid heroics without sufficient equity or clear bluff-catching evidence.',
    ].join('\n'),
  river_value: (context: BotDecisionContext) =>
    [
      'River Value',
      'Target value confidently while protecting against thin-value overreach.',
      `Context: ${formatPostflopEnvelope(context)}`,
      'Check back bluff-catchers and bet hands that can be called by worse.',
    ].join('\n'),
  river_facing_bet: (context: BotDecisionContext) =>
    [
      'River Facing Bet',
      'Use a disciplined bluff-catching and raise-for-value-only framework.',
      `Context: ${formatPostflopEnvelope(context)}`,
      'Large raises need strong nut or blocker logic, otherwise prefer call or fold.',
    ].join('\n'),
  river_bluff_catch: (context: BotDecisionContext) =>
    [
      'River Bluff Catch',
      'Focus on price-sensitive bluff-catching when facing a large river bet.',
      `Context: ${formatPostflopEnvelope(context)}`,
      'Do not raise thin bluff-catchers; compare blockers, showdown value, and MDF pressure.',
    ].join('\n'),
  pot_control: (context: BotDecisionContext) =>
    [
      'Pot Control',
      'Preserve showdown value and avoid building a bloated pot without a clear edge.',
      `Context: ${formatPostflopEnvelope(context)}`,
      'Favor checks and bluff-catch calls over thin betting lines in medium-strength nodes.',
    ].join('\n'),
} as const;
