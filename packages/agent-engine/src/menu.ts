import { classifyAction, type BotDecisionContext, type CoachActionKind } from '@aipoker/shared';

import type { AgentDecision } from './types.ts';

export const MENU_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type MenuId = (typeof MENU_IDS)[number];

/** One legal action the model can pick by letter. Amounts are street totals, as in `raise_to`. */
export interface MenuOption {
  id: MenuId;
  kind: CoachActionKind;
  /** Street total after the action; null for fold. */
  to: number | null;
  toBb: number | null;
  /** Bets and raises: chips beyond a call as a share of the pot after calling, as `CoachOption.size`. */
  potShare: number | null;
  /** Bets and raises: how often it must win the pot at once to break even as a pure bluff. */
  bluffBreakEven: number | null;
  /** Effective stack left after the action over the pot if it is called; null for fold. */
  sprAfter: number | null;
}

const PREFLOP_OPEN_BB = [2.2, 2.5, 3];
const PREFLOP_RERAISE_MULTIPLES = [3, 4];
const POSTFLOP_BET_POT_SHARES = [1 / 3, 1 / 2, 3 / 4, 1, 1.5];
const POSTFLOP_RAISE_POT_SHARES = [1 / 2, 3 / 4, 1];

/** Raise targets before clamping: the presets of `llm-bots.md`, "Menu construction". */
function raiseTargets(context: BotDecisionContext): number[] {
  if (context.phase === 'preflop') {
    return context.bettingState === 'unopened' || context.bettingState === 'facing_limpers'
      ? PREFLOP_OPEN_BB.map((bb) => (bb + context.preflopLimpersCount) * context.bigBlind)
      : PREFLOP_RERAISE_MULTIPLES.map((multiple) => multiple * context.currentBetToMatch);
  }
  if (context.currentBetToMatch === 0) {
    return POSTFLOP_BET_POT_SHARES.map((share) => context.myStreetCommitted + share * context.potTotal);
  }
  const afterCall = context.myStreetCommitted + context.callAmount;
  return [
    context.minRaiseTo,
    ...POSTFLOP_RAISE_POT_SHARES.map((share) => afterCall + share * (context.potTotal + context.callAmount)),
  ];
}

function describe(context: BotDecisionContext, id: MenuId, kind: CoachActionKind, to: number | null): MenuOption {
  const risked = to === null ? 0 : to - context.myStreetCommitted;
  const aggressive = kind === 'bet' || kind === 'raise' || kind === 'all_in';
  const potIfCalled = context.potTotal + risked + (to === null ? 0 : Math.max(0, to - context.currentBetToMatch));
  return {
    id,
    kind,
    to,
    toBb: to === null ? null : to / context.bigBlind,
    potShare: aggressive && to !== null
      ? (to - context.myStreetCommitted - context.callAmount) / (context.potTotal + context.callAmount)
      : null,
    bluffBreakEven: aggressive ? risked / (risked + context.potTotal) : null,
    sprAfter: to === null ? null : Math.max(0, context.effectiveStack - to) / potIfCalled,
  };
}

/**
 * The legal options for this decision, lettered A, B, C...: check, or fold and call; the preset
 * sizes clamped to the legal range; all-in. A size that clamps to the whole stack is the all-in,
 * and sizes are de-duplicated by total, so every option applies as is.
 */
export function buildMenu(context: BotDecisionContext): MenuOption[] {
  const entries: Array<{ kind: CoachActionKind; to: number | null }> = [];
  if (context.canCheck) {
    entries.push({ kind: 'check', to: context.myStreetCommitted });
  } else {
    entries.push({ kind: 'fold', to: null });
    if (context.canCall) {
      entries.push({ kind: 'call', to: context.myStreetCommitted + context.callAmount });
    }
  }

  const allInTo = context.myStreetCommitted + context.myStack;
  const allInRaises = context.canAllIn && allInTo > context.currentBetToMatch;
  if (context.canRaise) {
    const totals = raiseTargets(context)
      .map((target) => Math.min(context.maxRaiseTo, Math.max(context.minRaiseTo, Math.round(target))))
      .filter((to) => to < context.maxRaiseTo);
    for (const to of [...new Set(totals)].sort((left, right) => left - right)) {
      entries.push({ kind: classifyAction({ type: 'raise_to' }, context), to });
    }
  }
  if (allInRaises) {
    entries.push({ kind: 'all_in', to: allInTo });
  }

  return entries.map((entry, index) => describe(context, MENU_IDS[index]!, entry.kind, entry.to));
}

/** The engine action for a menu option. */
export function toDecision(option: MenuOption): AgentDecision {
  switch (option.kind) {
    case 'fold':
    case 'check':
    case 'call':
    case 'all_in':
      return { type: option.kind };
    default:
      return { type: 'raise_to', amount: option.to! };
  }
}

/** The action for a letter, or null when the letter is not on this menu. */
export function resolveChoice(menu: readonly MenuOption[], choice: string): AgentDecision | null {
  const option = menu.find((candidate) => candidate.id === choice);
  return option ? toDecision(option) : null;
}
