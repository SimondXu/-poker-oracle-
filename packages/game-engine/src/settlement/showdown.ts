import type { Card, HandInitPlayerState, Pot, PotPayout } from '../state/types.ts';

type RankVector = [number, number?, number?, number?, number?, number?];

const RANK_TO_VALUE: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

function rankValue(card: Card): number {
  const rank = card.charAt(0);
  return RANK_TO_VALUE[rank] ?? 0;
}

function compareRankVectors(a: RankVector, b: RankVector): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const aValue = a[i] ?? 0;
    const bValue = b[i] ?? 0;
    if (aValue > bValue) {
      return 1;
    }
    if (aValue < bValue) {
      return -1;
    }
  }
  return 0;
}

function detectStraightHigh(rankValues: number[]): number | null {
  const unique = [...new Set(rankValues)].sort((a, b) => b - a);
  if (unique.length < 5) {
    return null;
  }

  if (unique[0] === 14) {
    unique.push(1);
  }

  for (let i = 0; i <= unique.length - 5; i += 1) {
    const window = unique.slice(i, i + 5);
    const [a, b, c, d, e] = window;
    if (a === undefined || b === undefined || c === undefined || d === undefined || e === undefined) {
      continue;
    }
    if (
      a - 1 === b &&
      b - 1 === c &&
      c - 1 === d &&
      d - 1 === e
    ) {
      return a === 1 ? 5 : a;
    }
  }

  return null;
}

function evaluateFiveCards(cards: [Card, Card, Card, Card, Card]): RankVector {
  const suits = cards.map((card) => card[1]);
  const ranks = cards.map(rankValue).sort((a, b) => b - a);
  const [r0 = 0, r1 = 0, r2 = 0, r3 = 0, r4 = 0] = ranks;
  const rankCounts = new Map<number, number>();
  for (const rank of ranks) {
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
  }

  const groups = [...rankCounts.entries()].sort((a, b) => {
    if (a[1] !== b[1]) {
      return b[1] - a[1];
    }
    return b[0] - a[0];
  });

  const firstSuit = suits[0] ?? null;
  const flush = firstSuit !== null && suits.every((suit) => suit === firstSuit);
  const straightHigh = detectStraightHigh(ranks);

  if (flush && straightHigh !== null) {
    return [8, straightHigh];
  }

  if (groups[0]?.[1] === 4) {
    const quadRank = groups[0][0];
    const kicker = groups[1]?.[0] ?? 0;
    return [7, quadRank, kicker];
  }

  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) {
    return [6, groups[0][0], groups[1][0]];
  }

  if (flush) {
    return [5, r0, r1, r2, r3, r4];
  }

  if (straightHigh !== null) {
    return [4, straightHigh];
  }

  if (groups[0]?.[1] === 3) {
    const trips = groups[0][0];
    const kickers = groups
      .slice(1)
      .map(([rank]) => rank)
      .sort((a, b) => b - a);
    return [3, trips, kickers[0] ?? 0, kickers[1] ?? 0];
  }

  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    const pairRanks = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const [pairHigh = 0, pairLow = 0] = pairRanks;
    const kicker = groups[2]?.[0] ?? 0;
    return [2, pairHigh, pairLow, kicker];
  }

  if (groups[0]?.[1] === 2) {
    const pairRank = groups[0][0];
    const kickers = groups
      .slice(1)
      .map(([rank]) => rank)
      .sort((a, b) => b - a);
    return [1, pairRank, kickers[0] ?? 0, kickers[1] ?? 0, kickers[2] ?? 0];
  }

  return [0, r0, r1, r2, r3, r4];
}

export interface EvaluatedBestHand {
  rank: RankVector;
  bestCards: Card[];
}

export function evaluateBestSevenCards(cards: Card[]): EvaluatedBestHand {
  if (cards.length < 5) {
    return { rank: [0], bestCards: [] };
  }

  let best: RankVector | null = null;
  let bestCombo: Card[] = [];
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const cardA = cards[a];
            const cardB = cards[b];
            const cardC = cards[c];
            const cardD = cards[d];
            const cardE = cards[e];
            if (!cardA || !cardB || !cardC || !cardD || !cardE) {
              continue;
            }

            const rank = evaluateFiveCards([cardA, cardB, cardC, cardD, cardE]);
            if (!best || compareRankVectors(rank, best) > 0) {
              best = rank;
              bestCombo = [cardA, cardB, cardC, cardD, cardE];
            }
          }
        }
      }
    }
  }

  return { rank: best ?? [0], bestCards: bestCombo };
}

function orderWinnersFromButtonLeft(
  winners: HandInitPlayerState[],
  buttonMarkerSeat: number
): HandInitPlayerState[] {
  const bySeat = [...winners].sort((a, b) => a.seatIndex - b.seatIndex);
  const higher = bySeat.filter((player) => player.seatIndex > buttonMarkerSeat);
  const lowerOrEqual = bySeat.filter((player) => player.seatIndex <= buttonMarkerSeat);
  return [...higher, ...lowerOrEqual];
}

export function settleShowdownPots(
  players: HandInitPlayerState[],
  pots: Pot[],
  communityCards: Card[],
  buttonMarkerSeat: number
): PotPayout[] {
  const payouts: PotPayout[] = [];
  const playerById = new Map(players.map((player) => [player.id, player] as const));

  for (let potIndex = 0; potIndex < pots.length; potIndex += 1) {
    const pot = pots[potIndex];
    if (!pot || pot.amount <= 0) {
      continue;
    }

    const eligiblePlayers = pot.eligiblePlayerIds
      .map((playerId) => playerById.get(playerId))
      .filter((player): player is HandInitPlayerState => player !== undefined);
    if (eligiblePlayers.length === 0) {
      continue;
    }

    if (eligiblePlayers.length === 1) {
      const [winner] = eligiblePlayers;
      if (!winner) {
        continue;
      }

      winner.stack += pot.amount;
      payouts.push({
        potIndex,
        playerId: winner.id,
        amount: pot.amount
      });
      continue;
    }

    if (communityCards.length < 5) {
      continue;
    }

    const ranked = eligiblePlayers.map((player) => ({
      player,
      rank: evaluateBestSevenCards([...communityCards, ...player.holeCards]).rank
    }));

    const firstRanked = ranked[0];
    if (!firstRanked) {
      continue;
    }

    let winners = [firstRanked];
    for (let i = 1; i < ranked.length; i += 1) {
      const contender = ranked[i];
      const currentBest = winners[0];
      if (!contender || !currentBest) {
        continue;
      }

      const comparison = compareRankVectors(contender.rank, currentBest.rank);
      if (comparison > 0) {
        winners = [contender];
      } else if (comparison === 0) {
        winners.push(contender);
      }
    }

    const orderedWinners = orderWinnersFromButtonLeft(
      winners.map((winner) => winner.player),
      buttonMarkerSeat
    );
    const baseShare = Math.floor(pot.amount / orderedWinners.length);
    let remainder = pot.amount % orderedWinners.length;

    for (const winner of orderedWinners) {
      const oddChip = remainder > 0 ? 1 : 0;
      const amount = baseShare + oddChip;
      if (amount <= 0) {
        continue;
      }

      winner.stack += amount;
      payouts.push({
        potIndex,
        playerId: winner.id,
        amount
      });
      if (remainder > 0) {
        remainder -= 1;
      }
    }
  }

  return payouts;
}
