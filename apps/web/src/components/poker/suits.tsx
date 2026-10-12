import { memo, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Card suit letter as used in card strings ("Ah" → 'h'). */
export type SuitKey = 's' | 'h' | 'd' | 'c';

export function isSuitKey(value: string): value is SuitKey {
  return value === 's' || value === 'h' || value === 'd' || value === 'c';
}

/** Four-color deck text color per suit (SVGs fill with currentColor). */
export const SUIT_COLOR_CLASS: Readonly<Record<SuitKey, string>> = {
  s: 'text-suit-spade',
  h: 'text-suit-heart',
  d: 'text-suit-diamond',
  c: 'text-suit-club',
};

/**
 * Authored suit shapes on a 24×24 grid, all filled with currentColor.
 * Pure geometry, no ids/defs, so any number can render on one page.
 */
const SUIT_SHAPES: Readonly<Record<SuitKey, ReactNode>> = {
  s: (
    <path d="M12 1.6C13.4 3.9 16.1 6.2 18.5 8.3 20.6 10.1 22 11.9 22 14.4 22 17.3 19.7 19.5 16.9 19.5 15.3 19.5 13.9 18.8 13 17.6 13.3 19.6 14.2 21.1 15.9 22.4H8.1C9.8 21.1 10.7 19.6 11 17.6 10.1 18.8 8.7 19.5 7.1 19.5 4.3 19.5 2 17.3 2 14.4 2 11.9 3.4 10.1 5.5 8.3 7.9 6.2 10.6 3.9 12 1.6Z" />
  ),
  h: (
    <path d="M12 21.8C10.6 19.6 8 17.3 5.6 15.2 3.4 13.3 2 11.4 2 8.6 2 5.4 4.4 3 7.4 3 9.4 3 11.1 4.1 12 5.8 12.9 4.1 14.6 3 16.6 3 19.6 3 22 5.4 22 8.6 22 11.4 20.6 13.3 18.4 15.2 16 17.3 13.4 19.6 12 21.8Z" />
  ),
  d: <path d="M12 1.5C14.3 5.3 17 8.8 20 12 17 15.2 14.3 18.7 12 22.5 9.7 18.7 7 15.2 4 12 7 8.8 9.7 5.3 12 1.5Z" />,
  c: (
    <>
      <circle cx="12" cy="6.9" r="4.6" />
      <circle cx="6.6" cy="13.6" r="4.6" />
      <circle cx="17.4" cy="13.6" r="4.6" />
      <circle cx="12" cy="12.2" r="2.6" />
      <path d="M11 12.5C10.9 16.8 10 20 8.1 22.4H15.9C14 20 13.1 16.8 13 12.5Z" />
    </>
  ),
};

export interface SuitIconProps {
  suit: SuitKey;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

/**
 * One suit glyph, 1em square, decorative (aria-hidden: the card carries the label).
 * Color comes from `color`; add `SUIT_COLOR_CLASS[suit]` for the four-color deck.
 */
export const SuitIcon = memo(function SuitIcon({ suit, className, style }: SuitIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      fill="currentColor"
      className={cn('block size-[1em] shrink-0', className)}
      style={style}
    >
      {SUIT_SHAPES[suit]}
    </svg>
  );
});
