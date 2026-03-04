import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind 类名合并工具 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 格式化筹码数量（如 1200 → "1,200"，12000 → "12k"） */
export function formatChips(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 10_000) return `${(amount / 1_000).toFixed(1)}k`;
  return amount.toLocaleString('en-US');
}

/** 解析 Card 字符串（如 "Ah" → { rank: 'A', suit: 'h' }） */
export function parseCard(card: string): { rank: string; suit: string } {
  return {
    rank: card.slice(0, -1),
    suit: card.slice(-1),
  };
}

/** 判断花色是否为红色（红心/方块） */
export function isRedSuit(suit: string): boolean {
  return suit === 'h' || suit === 'd';
}

/** 花色 Unicode 符号 */
export const SUIT_SYMBOLS: Record<string, string> = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
};

/** 牌面 Rank 显示（T → 10） */
export function displayRank(rank: string): string {
  return rank === 'T' ? '10' : rank;
}

/** 底池赔率计算（callAmount / (pot + callAmount)） */
export function calcPotOdds(callAmount: number, potTotal: number): number {
  if (callAmount <= 0) return 0;
  return callAmount / (potTotal + callAmount);
}

/** 格式化时间（ms → "18s"） */
export function formatTimer(remainingMs: number): string {
  return `${Math.ceil(remainingMs / 1000)}s`;
}

/** 位置名称（seat index + 总座位数 → BTN/SB/BB/UTG...） */
export function getPositionName(
  seatIndex: number,
  buttonSeat: number,
  totalSeats: number,
): string {
  const offset = (seatIndex - buttonSeat + totalSeats) % totalSeats;
  const names: Record<number, string> = {
    0: 'BTN',
    1: 'SB',
    2: 'BB',
    3: 'UTG',
    4: 'HJ',
    5: 'CO',
  };
  return names[offset] ?? `+${offset}`;
}

/** 计算椭圆上各座位的坐标 */
export function calcSeatPositions(
  count: number,
  radiusX: number,
  radiusY: number,
  offsetAngle = -Math.PI / 2,
): Array<{ x: number; y: number; angle: number }> {
  return Array.from({ length: count }, (_, i) => {
    const angle = offsetAngle + (2 * Math.PI * i) / count;
    return {
      x: radiusX * Math.cos(angle),
      y: radiusY * Math.sin(angle),
      angle,
    };
  });
}
