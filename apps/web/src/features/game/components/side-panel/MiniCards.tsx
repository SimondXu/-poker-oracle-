import { cn, displayRank, parseCard, SUIT_SYMBOLS } from '@/lib/utils';

const SUIT_CLASS: Record<string, string> = {
  s: 'text-suit-s',
  h: 'text-suit-h',
  d: 'text-suit-d',
  c: 'text-suit-c',
};

/** Inline rank+suit tag in the 4-color deck: a tiny white card face so black spades stay readable on the dark panel. */
export function MiniCard({ card, className }: { card: string; className?: string }) {
  const { rank, suit } = parseCard(card);
  return (
    <span
      className={cn(
        'inline-flex items-baseline rounded-[3px] bg-card px-[3px] text-[12px] font-bold leading-[18px] tabular-nums',
        SUIT_CLASS[suit] ?? 'text-suit-s',
        className,
      )}
    >
      {displayRank(rank)}
      {SUIT_SYMBOLS[suit] ?? suit}
    </span>
  );
}

export function MiniCards({ cards, className }: { cards: readonly string[]; className?: string }) {
  if (cards.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-[3px] align-middle', className)}>
      {cards.map((card, index) => (
        <MiniCard key={`${card}-${index}`} card={card} />
      ))}
    </span>
  );
}
