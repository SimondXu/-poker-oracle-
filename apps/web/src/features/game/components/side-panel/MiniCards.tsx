import { CardRank, getCardLabel, isSuitKey, SUIT_COLOR_CLASS, SuitIcon } from '@/components/poker';
import { cn, displayRank, parseCard } from '@/lib/utils';

/**
 * Rank + suit on a small ivory card face (four-color deck), so black spades
 * stay readable on the navy panel. Ivory is reserved for cards: this is one.
 */
export function MiniCard({ card, size = 'sm', className }: { card: string; size?: 'sm' | 'md'; className?: string }) {
  const { rank, suit } = parseCard(card);
  const suitKey = isSuitKey(suit) ? suit : 's';
  return (
    <span
      role="img"
      aria-label={getCardLabel(card)}
      className={cn(
        'font-index inline-flex items-center justify-center gap-px rounded-[3px] bg-ivory font-bold shadow-[inset_0_0_0_1px_var(--color-ivory-edge)]',
        size === 'md' ? 'h-[26px] min-w-[26px] px-[3px] text-[16px] leading-none' : 'h-[19px] px-[3px] text-[13px] leading-none',
        SUIT_COLOR_CLASS[suitKey],
        className,
      )}
    >
      {/* Small print: CardRank draws Q as an authored glyph so it never reads as 0. */}
      <CardRank rank={displayRank(rank)} small />
      <SuitIcon suit={suitKey} className={size === 'md' ? 'text-[13px]' : 'text-[10px]'} />
    </span>
  );
}

export function MiniCards({
  cards,
  size = 'sm',
  className,
}: {
  cards: readonly string[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (cards.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-[3px] align-middle', className)}>
      {cards.map((card, index) => (
        <MiniCard key={`${card}-${index}`} card={card} size={size} />
      ))}
    </span>
  );
}
