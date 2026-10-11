import { memo, type CSSProperties } from 'react';
import { cn, displayRank, parseCard, SUIT_SYMBOLS } from '@/lib/utils';
import type { CardSize } from './types';

export interface CardProps {
  /** e.g. "Ah", "Td". Missing/null renders the back. */
  card?: string | null | undefined;
  /** Scales with the inherited font-size (em), so a table can scale every card at once. */
  size?: CardSize | undefined;
  faceDown?: boolean | undefined;
  /** Winner / best-five card: raised. */
  highlight?: boolean | undefined;
  /** Not in the best five / folded: darkened (not transparent, so the felt does not show through). */
  dim?: boolean | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

/** Card font-size relative to its parent; the card box is 2.5em × 3.5em of that. */
const SIZE_CLASS: Record<CardSize, string> = {
  sm: 'text-[0.625em]',
  md: 'text-[0.875em]',
  lg: 'text-[1.125em]',
  xl: 'text-[1.5em]',
};

const SUIT_CLASS: Record<string, string> = {
  s: 'text-suit-s',
  h: 'text-suit-h',
  d: 'text-suit-d',
  c: 'text-suit-c',
};

const RANK_NAMES: Record<string, string> = {
  A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: 'Ten',
  '9': 'Nine', '8': 'Eight', '7': 'Seven', '6': 'Six', '5': 'Five', '4': 'Four', '3': 'Three', '2': 'Two',
};

const SUIT_NAMES: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

export function getCardLabel(card: string): string {
  const { rank, suit } = parseCard(card);
  return `${RANK_NAMES[rank] ?? rank} of ${SUIT_NAMES[suit] ?? suit}`;
}

/** Children set their own leading-none: tailwind-merge drops a leading-* that precedes a text-[…] size class. */
const BOX =
  'relative inline-flex h-[3.5em] w-[2.5em] shrink-0 select-none overflow-hidden rounded-[var(--radius-card)] leading-none transition-[transform,opacity,filter] duration-150 motion-reduce:transition-none';

/**
 * Flat PokerNow-style card. Static: no motion inside; callers animate a wrapper.
 */
export const Card = memo(function Card({
  card,
  size = 'md',
  faceDown = false,
  highlight = false,
  dim = false,
  className,
  style,
}: CardProps) {
  if (faceDown || !card) {
    return (
      <span
        role="img"
        aria-label="Face-down card"
        className={cn(
          BOX,
          SIZE_CLASS[size],
          'bg-card-back shadow-[inset_0_0_0_0.14em_rgba(255,255,255,0.75),var(--shadow-card)]',
          dim && 'brightness-60',
          className,
        )}
        style={style}
      />
    );
  }

  const { rank, suit } = parseCard(card);
  const rankText = displayRank(rank);

  return (
    <span
      role="img"
      aria-label={getCardLabel(card)}
      className={cn(
        BOX,
        SIZE_CLASS[size],
        'flex-col items-start bg-card px-[0.2em] pt-[0.18em] font-bold',
        SUIT_CLASS[suit] ?? 'text-suit-s',
        'shadow-[var(--shadow-card)]',
        highlight && '-translate-y-[0.3em]',
        dim && 'brightness-60',
        className,
      )}
      style={style}
    >
      <span
        aria-hidden
        className={cn('text-[1.45em] leading-none tabular-nums', rankText.length > 1 && 'tracking-[-0.08em]')}
      >
        {rankText}
      </span>
      <span aria-hidden className="mt-[0.06em] text-[1.4em] leading-none">
        {SUIT_SYMBOLS[suit] ?? suit}
      </span>
    </span>
  );
});
