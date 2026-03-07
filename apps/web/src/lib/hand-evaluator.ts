import { evaluateBestSevenCards, type Card } from '@aipoker/game-engine';

export const HAND_RANK_NAMES: Record<number, string> = {
  0: '高牌',
  1: '一对',
  2: '两对',
  3: '三条',
  4: '顺子',
  5: '同花',
  6: '葫芦',
  7: '四条',
  8: '同花顺',
};

/** 评估手牌排名和最佳5张牌组合 */
export function evaluateHandRanking(
  holeCards: string[],
  communityCards: string[],
): { category: number; bestCards: string[] } {
  const allCards = [...holeCards, ...communityCards] as Card[];
  if (allCards.length < 5) return { category: 0, bestCards: [] };

  const { rank, bestCards } = evaluateBestSevenCards(allCards);
  return { category: rank[0] ?? 0, bestCards };
}

/** 获取牌型中文名称 */
export function getHandRankDisplayName(category: number): string {
  return HAND_RANK_NAMES[category] ?? '未知';
}

/** 返回最佳5张牌组合 */
export function findBestFiveCards(holeCards: string[], communityCards: string[]): string[] {
  const { bestCards } = evaluateHandRanking(holeCards, communityCards);
  return bestCards;
}
