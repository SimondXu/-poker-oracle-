import type { HandInitPlayerState, Pot } from '../state/types.ts';

function sameEligiblePlayers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

export function buildSidePots(players: HandInitPlayerState[]): Pot[] {
  const levels = [...new Set(players.map((player) => player.handCommitted).filter((value) => value > 0))].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let previousLevel = 0;

  for (const level of levels) {
    const slice = level - previousLevel;
    if (slice <= 0) {
      continue;
    }

    const contributors = players.filter((player) => player.handCommitted >= level);
    const eligiblePlayerIds = contributors
      .filter((player) => player.status !== 'folded')
      .map((player) => player.id);
    const amount = slice * contributors.length;

    if (amount <= 0 || eligiblePlayerIds.length === 0) {
      previousLevel = level;
      continue;
    }

    const previousPot = pots[pots.length - 1];
    if (previousPot && sameEligiblePlayers(previousPot.eligiblePlayerIds, eligiblePlayerIds)) {
      previousPot.amount += amount;
    } else {
      pots.push({
        amount,
        eligiblePlayerIds
      });
    }

    previousLevel = level;
  }

  return pots;
}
