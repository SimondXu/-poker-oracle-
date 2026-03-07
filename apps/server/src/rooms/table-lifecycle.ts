import type { TableLifecycleSnapshot } from '@aipoker/shared';

import type { RuntimeRoom } from './types.ts';

export function getTableLifecycleSnapshot(room: RuntimeRoom): TableLifecycleSnapshot {
  const eligiblePlayers = [...room.players.values()].filter((player) => !room.pendingDisconnectPlayerIds.has(player.id));
  const activeStackPlayers = eligiblePlayers.filter((player) => player.stack > 0);
  const activeHumanStackPlayers = activeStackPlayers.filter((player) => !player.isBot);
  const activeBotStackPlayers = activeStackPlayers.filter((player) => player.isBot);
  const activeStackPlayerCount = activeStackPlayers.length;
  const activeHumanStackPlayerCount = activeHumanStackPlayers.length;
  const activeBotStackPlayerCount = activeBotStackPlayers.length;
  const isTableFinished = room.handNumber > 0 && activeStackPlayerCount <= 1;
  const canStartNextHand = !isTableFinished && activeStackPlayerCount >= 2;
  const isBotsOnlyContinuation = canStartNextHand && activeHumanStackPlayerCount === 0 && activeBotStackPlayerCount >= 2;
  const champion = isTableFinished && activeStackPlayerCount === 1 ? activeStackPlayers[0] : null;

  return {
    activeStackPlayerCount,
    activeHumanStackPlayerCount,
    activeBotStackPlayerCount,
    isTableFinished,
    canStartNextHand,
    isBotsOnlyContinuation,
    championPlayerId: champion?.id ?? null,
    championPlayerName: champion?.name ?? null,
  };
}

export function canPlayerStartNextHand(room: RuntimeRoom, playerId: string): boolean {
  if (room.pendingDisconnectPlayerIds.has(playerId)) {
    return false;
  }

  const starter = room.players.get(playerId);
  if (!starter) {
    return false;
  }

  return !starter.isBot && starter.stack > 0;
}
