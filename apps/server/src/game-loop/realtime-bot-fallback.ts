import type { PlayerActionInput, ValidActions } from '@aipoker/game-engine';

type EmergencyValidActions = Pick<
  ValidActions,
  'canCheck' | 'canFold' | 'canCall' | 'canAllIn' | 'canRaise' | 'minRaiseTo'
>;

export function selectEmergencyBotActionInput(
  playerId: string,
  validActions: EmergencyValidActions,
): PlayerActionInput {
  if (validActions.canCheck) {
    return { playerId, type: 'check' };
  }
  if (validActions.canFold) {
    return { playerId, type: 'fold' };
  }
  if (validActions.canCall) {
    return { playerId, type: 'call' };
  }
  if (validActions.canAllIn) {
    return { playerId, type: 'all_in' };
  }
  if (validActions.canRaise) {
    return { playerId, type: 'raise_to', amount: validActions.minRaiseTo };
  }

  throw new Error('no_legal_emergency_action');
}
