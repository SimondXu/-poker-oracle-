import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isEditableOrSelfHandledTarget,
  resolveHotkey,
  type HotkeyEventLike,
  type HotkeyTargetLike,
} from './action-bar-hotkeys.ts';

function press(key: string, overrides: Partial<HotkeyEventLike> = {}): HotkeyEventLike {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...overrides };
}

const body: HotkeyTargetLike = { tagName: 'BODY', closest: () => null };
const button: HotkeyTargetLike = { tagName: 'BUTTON', closest: () => null };
const input: HotkeyTargetLike = { tagName: 'INPUT', closest: () => null };
const sliderThumb: HotkeyTargetLike = {
  tagName: 'SPAN',
  closest: (selector) => (selector.includes('[role="slider"]') ? {} : null),
};
const editableDiv: HotkeyTargetLike = { tagName: 'DIV', isContentEditable: true, closest: () => null };

test('letters map to commands regardless of case', () => {
  assert.deepEqual(resolveHotkey(press('f'), body, { raiseOpen: false }), { type: 'fold' });
  assert.deepEqual(resolveHotkey(press('F'), body, { raiseOpen: false }), { type: 'fold' });
  assert.deepEqual(resolveHotkey(press('c'), body, { raiseOpen: false }), { type: 'check-call' });
  assert.deepEqual(resolveHotkey(press('r'), body, { raiseOpen: true }), { type: 'open-raise' });
});

test('Enter, Esc and digits only apply while the raise row is open', () => {
  assert.equal(resolveHotkey(press('Enter'), body, { raiseOpen: false }), null);
  assert.equal(resolveHotkey(press('Escape'), body, { raiseOpen: false }), null);
  assert.equal(resolveHotkey(press('2'), body, { raiseOpen: false }), null);
  assert.deepEqual(resolveHotkey(press('Enter'), body, { raiseOpen: true }), { type: 'confirm' });
  assert.deepEqual(resolveHotkey(press('Escape'), body, { raiseOpen: true }), { type: 'cancel' });
  assert.deepEqual(resolveHotkey(press('1'), body, { raiseOpen: true }), { type: 'preset', index: 0 });
  assert.deepEqual(resolveHotkey(press('5'), body, { raiseOpen: true }), { type: 'preset', index: 4 });
  assert.equal(resolveHotkey(press('6'), body, { raiseOpen: true }), null);
  assert.equal(resolveHotkey(press('0'), body, { raiseOpen: true }), null);
});

test('Enter on a focused button is left to the button itself', () => {
  assert.equal(resolveHotkey(press('Enter'), button, { raiseOpen: true }), null);
});

test('modifiers and key repeat are ignored', () => {
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'] as const) {
    assert.equal(resolveHotkey(press('f', { [mod]: true }), body, { raiseOpen: false }), null);
  }
  assert.equal(resolveHotkey(press('f', { repeat: true }), body, { raiseOpen: false }), null);
});

test('typing in inputs, sliders and contenteditable never triggers hotkeys', () => {
  for (const target of [input, sliderThumb, editableDiv]) {
    assert.equal(isEditableOrSelfHandledTarget(target), true);
    assert.equal(resolveHotkey(press('f'), target, { raiseOpen: true }), null);
    assert.equal(resolveHotkey(press('1'), target, { raiseOpen: true }), null);
  }
  assert.equal(isEditableOrSelfHandledTarget(null), false);
  assert.equal(isEditableOrSelfHandledTarget(body), false);
});

test('unrelated keys are ignored', () => {
  assert.equal(resolveHotkey(press('x'), body, { raiseOpen: true }), null);
  assert.equal(resolveHotkey(press('ArrowUp'), body, { raiseOpen: true }), null);
});
