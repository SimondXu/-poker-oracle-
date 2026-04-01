import type { BotDecisionContext } from '@aipoker/shared';

export function buildDeterministicContextPrompt(context: BotDecisionContext): string {
  return [
    `phase: ${context.phase}`,
    `position: ${context.position}`,
    `betting_state: ${context.bettingState}`,
    `hole_cards: ${context.holeCards.join(' ')}`,
    `board_cards: ${context.communityCards.join(' ') || 'none'}`,
    `pot_total: ${context.potTotal}`,
    `my_stack: ${context.myStack}`,
    `my_street_committed: ${context.myStreetCommitted}`,
    `call_amount: ${context.callAmount}`,
    `current_bet_to_match: ${context.currentBetToMatch}`,
    `last_full_raise_size: ${context.lastFullRaiseSize}`,
    `can_fold: ${context.canFold}`,
    `can_check: ${context.canCheck}`,
    `can_call: ${context.canCall}`,
    `can_raise: ${context.canRaise}`,
    `min_raise_to: ${context.minRaiseTo}`,
    `max_raise_to: ${context.maxRaiseTo}`,
    `can_all_in: ${context.canAllIn}`,
    `effective_stack_bb: ${context.effectiveStackBb}`,
    `spr: ${context.spr}`,
    `preflop_limpers: ${context.preflopLimpersCount}`,
    `street_action_count: ${context.streetActionCount}`,
  ].join('\n');
}
