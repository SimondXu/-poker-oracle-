import type { GameAction } from '@aipoker/shared';

import { formatChips } from '../../../lib/utils.ts';

export interface ActionAmountDisplay {
  main: string;
  prefix: string | null;
  note: string | null;
}

export function getActionAmountDisplay(
  action: Pick<GameAction, 'type' | 'amount' | 'addedAmount' | 'toAmount'>
): ActionAmountDisplay | null {
  if (action.type === 'fold' || action.type === 'check') {
    return null;
  }

  if (action.type === 'all_in') {
    return {
      main: formatChips(action.toAmount),
      prefix: '到',
      note: action.addedAmount !== action.toAmount ? `+${formatChips(action.addedAmount)}` : null,
    };
  }

  if (action.type === 'call') {
    return {
      main: formatChips(action.addedAmount),
      prefix: null,
      note: null,
    };
  }

  return {
    main: formatChips(action.toAmount || action.amount),
    prefix: null,
    note: null,
  };
}
