import type { BotAction, BotValidActions } from '@aipoker/shared';

export type BotRng = () => number;

export function chooseBotAction(validActions: BotValidActions, rng: BotRng): BotAction {
  if (validActions.canCheck) {
    if (validActions.canCall && rng() < 0.2) {
      return { type: 'call', amount: validActions.callAmount };
    }
    return { type: 'check' };
  }

  if (validActions.canCall) {
    return { type: 'call', amount: validActions.callAmount };
  }

  return { type: 'fold' };
}
