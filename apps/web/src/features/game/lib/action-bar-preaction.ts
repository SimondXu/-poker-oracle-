import type { ActionType, HandState, ValidActions } from '@aipoker/shared';

export type PreActionKind = 'check_fold' | 'call_any';

/** A pre-selection is only valid for the hand and street it was made on. */
export interface PreActionSelection {
  kind: PreActionKind;
  streetKey: string;
}

export interface HeroContext {
  status: HandState['players'][number]['status'];
  stack: number;
  streetCommitted: number;
  /** `handNumber:communityCardCount` — changes on a new hand and on every new street. */
  streetKey: string;
}

export function getStreetKey(hand: Pick<HandState, 'handNumber' | 'communityCards'>): string {
  return `${hand.handNumber}:${hand.communityCards.length}`;
}

export function getHeroContext(
  hand: Pick<HandState, 'handNumber' | 'communityCards' | 'players'> | null,
  heroId: string | null | undefined,
): HeroContext | null {
  if (!hand || !heroId) return null;
  const hero = hand.players.find((player) => player.id === heroId);
  if (!hero) return null;
  return {
    status: hero.status,
    stack: hero.stack,
    streetCommitted: hero.streetCommitted,
    streetKey: getStreetKey(hand),
  };
}

/** Pre-actions are offered only while hero is still live in the hand with chips behind. */
export function canOfferPreAction(hero: HeroContext | null): boolean {
  return hero !== null && hero.status === 'active' && hero.stack > 0;
}

/** Whether a stored selection is still safe to honour. */
export function isPreActionCurrent(selection: PreActionSelection | null, hero: HeroContext | null): boolean {
  return selection !== null && canOfferPreAction(hero) && hero !== null && selection.streetKey === hero.streetKey;
}

export interface ResolvedPreAction {
  type: Extract<ActionType, 'fold' | 'check' | 'call'>;
}

/**
 * Turn a pre-selection into the real action once the turn arrives.
 * - check/fold: check if free, otherwise fold.
 * - call any: check if free, otherwise call whatever it costs.
 * Returns null when the selection can't be honoured (the player then acts manually).
 */
export function resolvePreAction(
  kind: PreActionKind | null,
  validActions: Pick<ValidActions, 'canCheck' | 'canCall' | 'canFold'>,
): ResolvedPreAction | null {
  if (kind === null) return null;
  if (validActions.canCheck) return { type: 'check' };
  if (kind === 'check_fold') return validActions.canFold ? { type: 'fold' } : null;
  return validActions.canCall ? { type: 'call' } : null;
}
