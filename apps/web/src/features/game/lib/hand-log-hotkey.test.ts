import assert from 'node:assert/strict';
import test from 'node:test';

import { isPanelToggleHotkey, type HotkeyEventLike } from './hand-log-hotkey.ts';

const plain: HotkeyEventLike = { key: 'l', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false };

test('plain L toggles, case-insensitively', () => {
  assert.equal(isPanelToggleHotkey(plain, { tagName: 'BODY' }), true);
  assert.equal(isPanelToggleHotkey({ ...plain, key: 'L' }, null), true);
});

test('other keys and modified or repeated presses are ignored', () => {
  assert.equal(isPanelToggleHotkey({ ...plain, key: 'k' }, null), false);
  assert.equal(isPanelToggleHotkey({ ...plain, metaKey: true }, null), false);
  assert.equal(isPanelToggleHotkey({ ...plain, ctrlKey: true }, null), false);
  assert.equal(isPanelToggleHotkey({ ...plain, altKey: true }, null), false);
  assert.equal(isPanelToggleHotkey({ ...plain, repeat: true }, null), false);
});

test('typing targets are ignored', () => {
  assert.equal(isPanelToggleHotkey(plain, { tagName: 'INPUT' }), false);
  assert.equal(isPanelToggleHotkey(plain, { tagName: 'textarea' }), false);
  assert.equal(isPanelToggleHotkey(plain, { tagName: 'DIV', isContentEditable: true }), false);
  assert.equal(isPanelToggleHotkey(plain, { tagName: 'SPAN', role: 'slider' }), false);
});
