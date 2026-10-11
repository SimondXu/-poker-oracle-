import { memo } from 'react';
import { cn, formatChips } from '@/lib/utils';

export interface ChipBubbleProps {
  amount: number;
  className?: string | undefined;
}

/** Yellow round bet bubble with the amount. Sized in em. */
export const ChipBubble = memo(function ChipBubble({ amount, className }: ChipBubbleProps) {
  return (
    <span
      aria-label={`Bet ${amount}`}
      className={cn(
        'inline-flex min-w-[2em] items-center justify-center rounded-full bg-chip px-[0.55em] py-[0.2em]',
        'text-[0.85em] font-bold leading-none tabular-nums text-plate-text shadow-[var(--shadow-card)]',
        className,
      )}
    >
      {formatChips(amount)}
    </span>
  );
});
