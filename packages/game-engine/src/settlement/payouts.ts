import type { HandInitPlayerState, Pot, PotPayout } from '../state/types.ts';

export function settleUncontestedPots(players: HandInitPlayerState[], pots: Pot[]): PotPayout[] {
  const payouts: PotPayout[] = [];

  for (let potIndex = 0; potIndex < pots.length; potIndex += 1) {
    const pot = pots[potIndex];
    if (!pot || pot.eligiblePlayerIds.length !== 1) {
      continue;
    }

    const [winnerId] = pot.eligiblePlayerIds;
    if (!winnerId) {
      continue;
    }

    const winner = players.find((player) => player.id === winnerId);
    if (!winner) {
      continue;
    }

    winner.stack += pot.amount;
    payouts.push({
      potIndex,
      playerId: winnerId,
      amount: pot.amount
    });
  }

  return payouts;
}
