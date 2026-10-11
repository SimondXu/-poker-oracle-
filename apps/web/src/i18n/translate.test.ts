import assert from 'node:assert/strict';
import test from 'node:test';

import { catalog } from './catalog.ts';
import { formatNumber, interpolate, translate } from './translate.ts';
import { LOCALES } from './types.ts';

test('interpolate fills {vars}, formats numbers per locale, keeps unknown placeholders', () => {
  assert.equal(interpolate('Call {amount}', { amount: 1240 }, 'en'), 'Call 1,240');
  assert.equal(interpolate('跟注 {amount}', { amount: 1240 }, 'zh'), '跟注 1,240');
  assert.equal(interpolate('Side {index}: {amount}', { index: 2, amount: '12.5k' }, 'en'), 'Side 2: 12.5k');
  assert.equal(interpolate('{a}{a}', { a: 'x' }, 'en'), 'xx');
  assert.equal(interpolate('Call {amount}', {}, 'en'), 'Call {amount}');
  assert.equal(interpolate('Call {amount}', undefined, 'en'), 'Call {amount}');
  assert.equal(interpolate('no vars', { amount: 1 }, 'en'), 'no vars');
});

test('translate resolves namespaced keys per locale', () => {
  assert.equal(translate('en', 'table.pot.label'), 'Pot');
  assert.equal(translate('zh', 'table.pot.label'), '底池');
  assert.equal(translate('en', 'actionbar.action.call', { amount: 120 }), 'Call 120');
  assert.equal(translate('zh', 'actionbar.action.call', { amount: 120 }), '跟注 120');
  assert.equal(translate('en', 'common.connection.reconnecting'), 'Reconnecting');
});

test('formatNumber groups digits and honors options', () => {
  assert.equal(formatNumber(1415, 'en'), '1,415');
  assert.equal(formatNumber(0.712, 'en', { style: 'percent' }), '71%');
  assert.equal(formatNumber(0.712, 'zh', { style: 'percent' }), '71%');
});

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every namespace has identical keys and placeholders in every locale', () => {
  for (const [namespace, tables] of Object.entries(catalog)) {
    const en = tables.en as Record<string, string>;
    const enKeys = Object.keys(en).sort();
    assert.ok(enKeys.length > 0, `${namespace} has keys`);
    for (const locale of LOCALES) {
      const table = tables[locale] as Record<string, string>;
      assert.deepEqual(Object.keys(table).sort(), enKeys, `${namespace}.${locale} key set`);
      for (const key of enKeys) {
        const value = table[key] ?? '';
        assert.ok(value.trim().length > 0, `${namespace}.${locale}.${key} is empty`);
        assert.deepEqual(placeholders(value), placeholders(en[key] ?? ''), `${namespace}.${locale}.${key} placeholders`);
      }
    }
  }
});
