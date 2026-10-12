/** Hotkey guard for the panel toggle (`L`). Pure so it can be tested without a DOM. */

export interface HotkeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

export interface HotkeyTargetLike {
  tagName?: string | undefined;
  isContentEditable?: boolean | undefined;
  /** `role` of the focused element or its closest ARIA widget ancestor. */
  role?: string | null | undefined;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const CAPTURING_ROLES = new Set(['slider', 'textbox', 'combobox', 'spinbutton', 'menu', 'listbox']);

export function isPanelToggleHotkey(event: HotkeyEventLike, target: HotkeyTargetLike | null): boolean {
  if (event.key.toLowerCase() !== 'l') return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return false;
  if (!target) return true;
  if (target.tagName && EDITABLE_TAGS.has(target.tagName.toUpperCase())) return false;
  if (target.isContentEditable) return false;
  if (target.role && CAPTURING_ROLES.has(target.role)) return false;
  return true;
}
