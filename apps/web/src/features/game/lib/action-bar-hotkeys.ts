export type HotkeyCommand =
  | { type: 'fold' }
  | { type: 'check-call' }
  | { type: 'open-raise' }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'preset'; index: number };

export interface HotkeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

/** Subset of `Element` the target check needs (keeps the function testable without a DOM). */
export interface HotkeyTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

export const PRESET_HOTKEY_COUNT = 5;

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
/** Controls that own their own keyboard handling (Radix slider/menus/popovers). */
const SELF_HANDLED_SELECTOR = '[role="slider"], [role="menu"], [role="menuitem"], [role="listbox"], [role="dialog"], [data-radix-popper-content-wrapper]';
/** A focused button/link already activates on Enter/Space; a global Enter would fire it twice. */
const NATIVE_ACTIVATION_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);

export function isEditableOrSelfHandledTarget(target: HotkeyTargetLike | null): boolean {
  if (!target) return false;
  if (target.tagName && EDITABLE_TAGS.has(target.tagName.toUpperCase())) return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.(SELF_HANDLED_SELECTOR) || target.closest?.('[contenteditable=""], [contenteditable="true"]'));
}

export function isNativeActivationTarget(target: HotkeyTargetLike | null): boolean {
  return Boolean(target?.tagName && NATIVE_ACTIVATION_TAGS.has(target.tagName.toUpperCase()));
}

/**
 * Map a keydown to an action-bar command, or null when the key must be left alone.
 * Presets 1-5 and Enter/Esc only exist while the raise row is open.
 */
export function resolveHotkey(
  event: HotkeyEventLike,
  target: HotkeyTargetLike | null,
  context: { raiseOpen: boolean },
): HotkeyCommand | null {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  if (isEditableOrSelfHandledTarget(target)) return null;

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  switch (key) {
    case 'f':
      return { type: 'fold' };
    case 'c':
      return { type: 'check-call' };
    case 'r':
      return { type: 'open-raise' };
    case 'Enter':
      if (!context.raiseOpen || isNativeActivationTarget(target)) return null;
      return { type: 'confirm' };
    case 'Escape':
      return context.raiseOpen ? { type: 'cancel' } : null;
    default: {
      if (!context.raiseOpen || !/^[1-9]$/.test(key)) return null;
      const index = Number(key) - 1;
      return index < PRESET_HOTKEY_COUNT ? { type: 'preset', index } : null;
    }
  }
}
