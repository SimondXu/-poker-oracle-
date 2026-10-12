import type { ActionType, ValidActions } from '@aipoker/shared';

/** Pot fractions behind the 1/3, 1/2, 3/4, Pot presets (All-in is the fifth, always the max). */
const POT_FRACTION_PRESETS = [
  { id: 'third', label: '1/3', fraction: 1 / 3 },
  { id: 'half', label: '1/2', fraction: 1 / 2 },
  { id: 'three-quarter', label: '3/4', fraction: 3 / 4 },
  { id: 'pot', label: 'Pot', fraction: 1 },
] as const;

/** Preflop sizes are multiples of the bet to match (the big blind when unopened). */
const PREFLOP_MULTIPLE_PRESETS = [
  { id: 'x2.5', label: '2.5x', multiple: 2.5 },
  { id: 'x3', label: '3x', multiple: 3 },
  { id: 'x4', label: '4x', multiple: 4 },
] as const;

export type SizingPresetId =
  | (typeof POT_FRACTION_PRESETS)[number]['id']
  | (typeof PREFLOP_MULTIPLE_PRESETS)[number]['id']
  | 'all-in';

export interface SizingPreset {
  id: SizingPresetId;
  label: string;
  /** Raise-to amount, already clamped to the legal range. */
  amount: number;
  isAllIn: boolean;
}

export interface RaiseBounds {
  min: number;
  max: number;
}

export interface SizingContext {
  /** Total pot including every street bet (same number the table shows). */
  pot: number;
  /** Chips hero still has to add to match the bet (0 when unopened). */
  callAmount: number;
  /** Chips hero already has in front on this street (0 when unknown). */
  heroStreetBet: number;
  bounds: RaiseBounds;
  /**
   * `validActions.canAllIn`. False when the server will not take an `all_in` action (hero can no
   * longer raise, e.g. the betting was not reopened); the All-in preset is then left out.
   */
  canAllIn: boolean;
  /** Preflop presets size off the bet to match instead of the pot. */
  isPreflop?: boolean;
}

/**
 * Legal raise-to range. A short stack can have `minBetOrRaiseTo > maxBetOrRaiseTo`
 * (it may only shove); in that case the only legal amount is the max.
 */
export function getRaiseBounds(validActions: Pick<ValidActions, 'minBetOrRaiseTo' | 'maxBetOrRaiseTo'>): RaiseBounds {
  const max = Math.max(0, validActions.maxBetOrRaiseTo);
  return { min: Math.min(validActions.minBetOrRaiseTo, max), max };
}

export function clampRaiseTo(amount: number, bounds: RaiseBounds): number {
  if (!Number.isFinite(amount)) return bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(amount)));
}

/**
 * Raise-to amount for a pot-sized fraction: call first, then add `fraction` of
 * the pot as it would stand after the call. Unopened (callAmount 0) this is
 * simply `fraction * pot`. `heroStreetBet` turns the added chips into a
 * street-total "raise to" figure.
 */
export function potFractionRaiseTo(
  fraction: number,
  context: Omit<SizingContext, 'bounds' | 'canAllIn'>,
): number {
  const potAfterCall = context.pot + context.callAmount;
  return context.heroStreetBet + context.callAmount + Math.round(fraction * potAfterCall);
}

export function buildSizingPresets(context: SizingContext): SizingPreset[] {
  const { bounds, canAllIn } = context;
  const betToMatch = context.heroStreetBet + context.callAmount;
  const sized: Array<{ id: SizingPresetId; label: string; raiseTo: number }> = context.isPreflop
    ? [
        ...PREFLOP_MULTIPLE_PRESETS.map((preset) => ({ id: preset.id, label: preset.label, raiseTo: preset.multiple * betToMatch })),
        { id: 'pot', label: 'Pot', raiseTo: potFractionRaiseTo(1, context) },
      ]
    : POT_FRACTION_PRESETS.map((preset) => ({ id: preset.id, label: preset.label, raiseTo: potFractionRaiseTo(preset.fraction, context) }));

  const presets: SizingPreset[] = [];
  const seen = new Set<number>(canAllIn ? [bounds.max] : []);
  // Clamping can land several sizes on the same amount (min raise, or the whole stack); show it once.
  for (const preset of sized) {
    const amount = clampRaiseTo(preset.raiseTo, bounds);
    if (seen.has(amount)) continue;
    seen.add(amount);
    presets.push({ id: preset.id, label: preset.label, amount, isAllIn: false });
  }
  if (canAllIn) {
    presets.push({ id: 'all-in', label: 'All-in', amount: bounds.max, isAllIn: true });
  }
  return presets;
}

/** Parse the numeric input. Empty / non-numeric text returns null; otherwise the clamped amount. */
export function parseAmountDraft(draft: string, bounds: RaiseBounds): number | null {
  const digits = draft.replace(/[^\d]/g, '');
  if (digits === '') return null;
  return clampRaiseTo(Number(digits), bounds);
}

export interface RaiseActionRequest {
  type: Extract<ActionType, 'bet' | 'raise_to' | 'all_in'>;
  amount: number;
}

/**
 * Reaching the max is an all-in only when the server allows `all_in` (`canAllIn`); otherwise the
 * max is sent as a plain bet (unopened) or raise_to. Below the max it is always bet / raise_to.
 */
export function resolveRaiseAction(
  amount: number,
  validActions: Pick<ValidActions, 'canBet' | 'canAllIn' | 'minBetOrRaiseTo' | 'maxBetOrRaiseTo'>,
): RaiseActionRequest {
  const bounds = getRaiseBounds(validActions);
  const clamped = clampRaiseTo(amount, bounds);
  if (clamped >= bounds.max && validActions.canAllIn) return { type: 'all_in', amount: bounds.max };
  return { type: validActions.canBet ? 'bet' : 'raise_to', amount: clamped };
}

/** True when calling would put hero's whole stack in. */
export function isCallAllIn(
  validActions: Pick<ValidActions, 'canCall' | 'callAmount'>,
  heroStack: number | null,
): boolean {
  return validActions.canCall && heroStack !== null && heroStack > 0 && validActions.callAmount >= heroStack;
}

export function formatAmount(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}
