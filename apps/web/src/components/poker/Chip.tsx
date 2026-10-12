import { memo, type CSSProperties } from 'react';
import { cn, formatChips } from '@/lib/utils';

/** `brass`: navy chip with brass edge notches (calls, blinds, bets). `vermilion`: raise / all-in chip. */
export type ChipTone = 'brass' | 'vermilion';

export interface ChipProps {
  tone?: ChipTone | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

const TONES: Readonly<Record<ChipTone, { face: string; edge: string; rule: string }>> = {
  brass: { face: 'var(--color-ink-2)', edge: 'var(--color-brass)', rule: 'rgb(184 154 94 / 0.55)' },
  vermilion: { face: 'var(--color-vermilion)', edge: 'var(--color-ivory)', rule: 'rgb(242 236 224 / 0.6)' },
};

/**
 * Engraved bet chip, 1em square: face, a ring of eight edge notches, a fine
 * inner rule. Decorative (aria-hidden). No ids, safe to repeat.
 */
export const Chip = memo(function Chip({ tone = 'brass', className, style }: ChipProps) {
  const { face, edge, rule } = TONES[tone];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className={cn('block size-[1em] shrink-0 drop-shadow-[0_0.06em_0.08em_rgb(5_8_16/0.5)]', className)}
      style={style}
    >
      <circle cx="12" cy="12" r="11.25" fill={face} stroke="var(--color-ink-1)" strokeWidth="1.5" />
      {/* 2π·8.6 ≈ 54.04 → 8 notches of 3.38 with equal gaps. */}
      <circle
        cx="12"
        cy="12"
        r="8.6"
        fill="none"
        stroke={edge}
        strokeWidth="3.4"
        strokeDasharray="3.378 3.378"
        transform="rotate(-11.25 12 12)"
      />
      <circle cx="12" cy="12" r="5.4" fill="none" stroke={rule} strokeWidth="0.9" />
    </svg>
  );
});

export interface ChipBubbleProps {
  amount: number;
  tone?: ChipTone | undefined;
  /** Accessible name override (e.g. translated). Defaults to "Bet 120". */
  label?: string | undefined;
  className?: string | undefined;
}

/**
 * A bet on the felt: engraved chip + amount in the index face. Sized in em
 * (chip 1.5em, amount 1.15em); set font-size on a wrapper to scale it.
 */
export const ChipBubble = memo(function ChipBubble({ amount, tone = 'brass', label, className }: ChipBubbleProps) {
  return (
    <span
      role="img"
      aria-label={label ?? `Bet ${amount}`}
      className={cn('inline-flex items-center gap-[0.3em] whitespace-nowrap leading-none', className)}
    >
      <Chip tone={tone} className="text-[1.5em]" />
      <span
        aria-hidden
        className="font-index text-[1.15em] font-bold text-ivory [text-shadow:0_1px_1px_rgb(5_8_16/0.45)]"
      >
        {formatChips(amount)}
      </span>
    </span>
  );
});
