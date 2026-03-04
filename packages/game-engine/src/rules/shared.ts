import type { HandInitPlayerInput, HandInitPlayerState, PlayerStatus } from '../state/types.ts';

export function sortPlayersBySeat(players: HandInitPlayerState[]): HandInitPlayerState[] {
  return [...players].sort((a, b) => a.seatIndex - b.seatIndex);
}

export function findNextSeat(
  players: HandInitPlayerState[],
  currentSeat: number,
  isEligible: (player: HandInitPlayerState) => boolean
): number | null {
  const sorted = sortPlayersBySeat(players);
  const higher = sorted.find((player) => player.seatIndex > currentSeat && isEligible(player));
  if (higher) {
    return higher.seatIndex;
  }

  const first = sorted.find((player) => isEligible(player));
  return first?.seatIndex ?? null;
}

export function findNextOccupiedSeat(players: HandInitPlayerInput[], currentSeat: number): number {
  let bestHigher: number | null = null;
  let lowest: number | null = null;

  for (const player of players) {
    if (lowest === null || player.seatIndex < lowest) {
      lowest = player.seatIndex;
    }

    if (player.seatIndex > currentSeat && (bestHigher === null || player.seatIndex < bestHigher)) {
      bestHigher = player.seatIndex;
    }
  }

  return bestHigher ?? (lowest ?? currentSeat);
}

export function toSettledPlayer(
  player: HandInitPlayerInput,
  committed: number,
  currentBetToMatch: number
): HandInitPlayerState {
  const stack = player.stack - committed;
  const status: PlayerStatus = stack === 0 ? 'all_in' : 'active';

  return {
    ...player,
    stack,
    streetCommitted: committed,
    handCommitted: committed,
    status,
    holeCards: [],
    hasActedThisStreet: false,
    matchedBetToMatchAtLastAction: currentBetToMatch
  };
}

export function isPlayerEligibleToAct(player: HandInitPlayerState): boolean {
  return player.status === 'active' && player.stack > 0;
}

export function getPlayerById(players: HandInitPlayerState[], playerId: string): HandInitPlayerState | undefined {
  return players.find((player) => player.id === playerId);
}

export function computePotTotal(players: HandInitPlayerState[]): number {
  return players.reduce((total, player) => total + player.handCommitted, 0);
}

export function getPendingActorIds(players: HandInitPlayerState[]): string[] {
  return sortPlayersBySeat(players)
    .filter((player) => isPlayerEligibleToAct(player))
    .map((player) => player.id);
}

export function getActiveInHandPlayers(players: HandInitPlayerState[]): HandInitPlayerState[] {
  return players.filter((player) => player.status !== 'folded');
}

export function resetPendingActors(players: HandInitPlayerState[], raiserId: string): string[] {
  return sortPlayersBySeat(players)
    .filter((player) => player.id !== raiserId && isPlayerEligibleToAct(player))
    .map((player) => player.id);
}

export function determineNextActorSeat(
  players: HandInitPlayerState[],
  afterSeat: number,
  pendingActorIds: string[]
): number | null {
  if (pendingActorIds.length === 0) {
    return null;
  }

  const pending = new Set(pendingActorIds);
  return findNextSeat(players, afterSeat, (player) => pending.has(player.id) && isPlayerEligibleToAct(player));
}
