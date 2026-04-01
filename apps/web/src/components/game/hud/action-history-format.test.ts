import assert from 'node:assert/strict';
import test from 'node:test';

import { getActionAmountDisplay } from './action-history-format.ts';

test('uses added amount for call actions', () => {
  assert.deepEqual(
    getActionAmountDisplay({
      type: 'call',
      amount: 50,
      addedAmount: 50,
      toAmount: 100,
    }),
    {
      main: '50',
      prefix: null,
      note: null,
    },
  );
});

test('uses toAmount and explicit prefix for all-in actions', () => {
  assert.deepEqual(
    getActionAmountDisplay({
      type: 'all_in',
      amount: 150,
      addedAmount: 100,
      toAmount: 150,
    }),
    {
      main: '150',
      prefix: '到',
      note: '+100',
    },
  );
});

test('omits amount display for zero-amount actions', () => {
  assert.equal(
    getActionAmountDisplay({
      type: 'check',
      amount: 0,
      addedAmount: 0,
      toAmount: 0,
    }),
    null,
  );
});
