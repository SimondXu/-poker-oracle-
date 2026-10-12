import { memo, useId, type CSSProperties } from 'react';
import { cn, formatChips } from '@/lib/utils';
import { POT_MEDALLION_EM } from './types';

export interface PotMedallionSidePot {
  /** Already translated, e.g. t('table.pot.main') / t('table.pot.side', { index: 1 }). */
  label: string;
  amount: number;
}

export interface PotMedallionProps {
  /** Pot total (live street bets included; one source: getHandPotTotal). */
  total: number;
  /** Optional main/side split, printed inside the medallion under the amount. Hidden when empty. */
  sidePots?: readonly PotMedallionSidePot[] | undefined;
  /** Printed label above the amount, already translated (t('table.pot.label')). */
  label: string;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

/** Diagonal lattice over the 210×88 grid, one path. */
function latticePath(step: number): string {
  const parts: string[] = [];
  for (let c = -88; c < 210; c += step) parts.push(`M${c} 0L${c + 88} 88`);
  for (let c = 0; c < 298; c += step) parts.push(`M${c} 0L${c - 88} 88`);
  return parts.join('');
}

const LATTICE = latticePath(7);

/**
 * The signature: the pot printed inside the card-back medallion. The same
 * engraving as the card back (brass lattice band between brass rules) around a
 * navy oval holding the tracked label and the amount in the index face.
 * POT_MEDALLION_EM (10.5em × 4.4em) of its own font-size; everything inside is
 * in em, so set font-size on it to scale (the label uses the stage type token
 * `text-seat-micro`, so it holds the 11px floor). The amount is aria-live.
 */
export const PotMedallion = memo(function PotMedallion({ total, sidePots, label, className, style }: PotMedallionProps) {
  const clipId = useId();
  const hasSidePots = !!sidePots && sidePots.length > 0;
  return (
    <div
      className={cn('relative shrink-0 drop-shadow-[0_0.12em_0.2em_rgb(5_8_16/0.45)]', className)}
      style={{ width: `${POT_MEDALLION_EM.w}em`, height: `${POT_MEDALLION_EM.h}em`, ...style }}
    >
      <svg viewBox="0 0 210 88" aria-hidden focusable="false" className="absolute inset-0 block size-full">
        <defs>
          <clipPath id={clipId}>
            <ellipse cx="105" cy="44" rx="104" ry="43" />
          </clipPath>
        </defs>
        <ellipse cx="105" cy="44" rx="104" ry="43" fill="var(--color-ink-3)" />
        <path
          d={LATTICE}
          clipPath={`url(#${clipId})`}
          fill="none"
          stroke="var(--color-brass)"
          strokeOpacity="0.4"
          strokeWidth="0.8"
        />
        <ellipse
          cx="105"
          cy="44"
          rx="104"
          ry="43"
          fill="none"
          stroke="var(--color-brass)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <ellipse
          cx="105"
          cy="44"
          rx="95"
          ry="35"
          fill="var(--color-ink-2)"
          stroke="var(--color-brass)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <ellipse
          cx="105"
          cy="44"
          rx="90.5"
          ry="31"
          fill="none"
          stroke="var(--color-brass)"
          strokeOpacity="0.45"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center [line-height:1]"
        aria-live="polite"
        aria-atomic="true"
      >
        {/* Stage type token (≥ 11px, one step with the plate labels); CJK drops the wide tracking. */}
        <span className="label-index text-seat-micro tracking-caps-wide pl-[0.24em] text-brass [&:lang(zh)]:pl-0 [&:lang(zh)]:tracking-caps">
          {label}
        </span>
        <span
          className={cn(
            'font-index font-bold tracking-[0.01em] text-text',
            hasSidePots ? 'mt-[0.04em] text-[1.6em]' : 'mt-[0.08em] text-[1.9em]',
          )}
        >
          {formatChips(total)}
        </span>
        {hasSidePots && (
          <span className="font-index mt-[0.12em] flex gap-[0.7em] whitespace-nowrap text-[0.6em] font-semibold text-ivory/85">
            {sidePots.map((pot, index) => (
              <span key={index}>
                <span className="label-index mr-[0.3em] text-brass">{pot.label}</span>
                {formatChips(pot.amount)}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
});
