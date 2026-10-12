import { memo, type CSSProperties } from 'react';
import { cn, displayRank, parseCard } from '@/lib/utils';
import { isSuitKey, SUIT_COLOR_CLASS, SuitIcon, type SuitKey } from './suits';
import type { CardSize } from './types';

export interface CardProps {
  /** e.g. "Ah", "Td". Missing/null renders the back. */
  card?: string | null | undefined;
  /**
   * Size step (font-size relative to the parent; the box is 2.5em × 3.5em of that) and print
   * detail: xs/sm print the index only, md+ add the center pip / court panel. A caller may
   * override the font-size through `style` and keep the detail of `size`.
   */
  size?: CardSize | undefined;
  faceDown?: boolean | undefined;
  /** Winner / best-five card: raised, brass edge. */
  highlight?: boolean | undefined;
  /** Not in the best five / folded: darkened one ink step (not transparent, the felt must not show through). */
  dim?: boolean | undefined;
  /** Accessible name override (e.g. translated). Defaults to "Ace of spades" / "Face-down card". */
  label?: string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

const SIZE_CLASS: Record<CardSize, string> = {
  xs: 'text-[0.5em]',
  sm: 'text-[0.625em]',
  md: 'text-[0.875em]',
  lg: 'text-[1.125em]',
  xl: 'text-[1.5em]',
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

function isIndexOnly(size: CardSize): boolean {
  return size === 'xs' || size === 'sm';
}

/** Children set their own leading: tailwind-merge drops a leading-* that precedes a text-[…] size class. */
const BOX =
  'relative inline-block h-[3.5em] w-[2.5em] shrink-0 select-none overflow-hidden rounded-[var(--radius-card)] [line-height:1] transition-[translate,filter,box-shadow] duration-180 ease-out motion-reduce:transition-none';

/** Ivory stock: a hair lighter at the top edge, the printed edge as a 1px inset rule. */
const FACE_STOCK =
  'bg-[linear-gradient(172deg,color-mix(in_oklab,var(--color-ivory)_70%,white)_0%,var(--color-ivory)_38%,color-mix(in_oklab,var(--color-ivory)_90%,var(--color-ivory-shade))_100%)]';
const FACE_SHADOW = 'shadow-[inset_0_0_0_1px_var(--color-ivory-edge),var(--shadow-card)]';
const FACE_SHADOW_RAISED =
  'shadow-[inset_0_0_0_1px_var(--color-ivory-edge),0_0_0_0.06em_var(--color-brass),0_0.22em_0.45em_-0.08em_rgb(5_8_16/0.6)]';
const BACK_SHADOW = 'shadow-[inset_0_0_0_1px_rgb(5_8_16/0.55),var(--shadow-card)]';
/** Face dim: the stock sinks one step (ivory → ivory shade) and the ink mutes; no grey wash. */
const FACE_DIM = 'bg-none bg-ivory-shade saturate-[0.65] [&>*]:opacity-75';
const BACK_DIM = 'brightness-[0.7]';

/**
 * Printed playing card. Ivory stock with a fine inner frame; condensed rank
 * index with its suit under it, top-left and mirrored bottom-right; a center
 * pip on number cards, a framed double-ended rank panel on courts. Four-color
 * deck, authored SVG suits. Face-down: the engraved navy back. Static: no motion
 * inside except the highlight/dim transition; callers animate a wrapper.
 */
export const Card = memo(function Card({
  card,
  size = 'md',
  faceDown = false,
  highlight = false,
  dim = false,
  label,
  className,
  style,
}: CardProps) {
  const indexOnly = isIndexOnly(size);

  if (faceDown || !card) {
    return (
      <span
        role="img"
        aria-label={label ?? 'Face-down card'}
        className={cn(BOX, SIZE_CLASS[size], 'bg-ink-2', BACK_SHADOW, dim && BACK_DIM, className)}
        style={style}
      >
        <CardBack detailed={!indexOnly} />
      </span>
    );
  }

  const { rank, suit } = parseCard(card);
  const rankText = displayRank(rank);
  const suitKey: SuitKey = isSuitKey(suit) ? suit : 's';
  const isCourt = rank === 'J' || rank === 'Q' || rank === 'K';

  return (
    <span
      role="img"
      aria-label={label ?? getCardLabel(card)}
      className={cn(
        BOX,
        SIZE_CLASS[size],
        FACE_STOCK,
        highlight ? FACE_SHADOW_RAISED : FACE_SHADOW,
        SUIT_COLOR_CLASS[suitKey],
        highlight && '-translate-y-[0.3em]' /* = CARD_HIGHLIGHT_RAISE_EM */,
        dim && FACE_DIM,
        className,
      )}
      style={style}
    >
      {size !== 'xs' && (
        <span aria-hidden className="absolute inset-[0.075em] rounded-[0.17em] border border-ivory-edge/80" />
      )}
      <CornerIndex rank={rankText} suit={suitKey} indexOnly={indexOnly} />
      <CornerIndex rank={rankText} suit={suitKey} indexOnly={indexOnly} flipped />
      {!indexOnly &&
        (isCourt ? (
          <CourtPanel rank={rankText} suit={suitKey} />
        ) : (
          <SuitIcon
            suit={suitKey}
            className={cn(
              'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
              rank === 'A' ? 'text-[1.5em]' : 'text-[1.12em]',
            )}
          />
        ))}
    </span>
  );
});

function CornerIndex({
  rank,
  suit,
  indexOnly,
  flipped = false,
}: {
  rank: string;
  suit: SuitKey;
  indexOnly: boolean;
  flipped?: boolean;
}) {
  const isTen = rank.length > 1;
  return (
    <span
      aria-hidden
      className={cn(
        'absolute flex flex-col items-center',
        indexOnly ? 'min-w-[0.8em]' : 'min-w-[0.6em]',
        flipped
          ? cn('rotate-180', indexOnly ? 'bottom-[0.14em] right-[0.09em]' : 'bottom-[0.15em] right-[0.11em]')
          : indexOnly
            ? 'left-[0.09em] top-[0.14em]'
            : 'left-[0.11em] top-[0.15em]',
      )}
    >
      <CardRank
        rank={rank}
        small={indexOnly}
        className={cn(
          indexOnly ? 'text-[1.22em]' : 'text-[1.02em]',
          isTen && 'tracking-[-0.07em] [margin-right:-0.07em]',
          isTen && indexOnly && 'scale-x-[0.88]',
        )}
      />
      <SuitIcon suit={suit} className={indexOnly ? 'mt-[0.2em] text-[0.7em]' : 'mt-[0.2em] text-[0.48em]'} />
    </span>
  );
}

export interface CardRankProps {
  /** Display rank ("A", "10", "Q"…), e.g. from displayRank(). */
  rank: string;
  /**
   * Small print (index-only cards, mini cards): Q is drawn as an authored glyph
   * with a heavy tail breaking out of the bowl, so it never reads as 0.
   */
  small?: boolean | undefined;
  className?: string | undefined;
}

/** Rank in the index face, cap box 0.72em of its font-size. */
export function CardRank({ rank, small = false, className }: CardRankProps) {
  if (small && rank === 'Q') {
    return (
      <span className={cn('block [line-height:0.72]', className)}>
        <svg
          viewBox="0 0 10 17"
          aria-hidden
          focusable="false"
          className="mb-[-0.15em] block h-[0.86em] w-[0.5em] overflow-visible"
        >
          <rect x="1.15" y="1.15" width="7.7" height="11.7" rx="3.85" fill="none" stroke="currentColor" strokeWidth="2.3" />
          <path d="M5.4 10.1L9.7 16.6" stroke="currentColor" strokeWidth="2.7" strokeLinecap="square" />
        </svg>
      </span>
    );
  }
  return <span className={cn('font-index block font-bold [line-height:0.72]', className)}>{rank}</span>;
}

/**
 * Court card center: a framed panel printed in the suit's ink (fine double
 * rule, tinted ground) holding the rank large, a suit pip at each end.
 */
function CourtPanel({ rank, suit }: { rank: string; suit: SuitKey }) {
  return (
    <span
      aria-hidden
      className="absolute inset-x-[0.74em] inset-y-[0.3em] flex flex-col items-center justify-between rounded-[0.05em] border border-current/50 bg-current/[0.06] py-[0.14em] shadow-[inset_0_0_0_0.05em_var(--color-ivory),inset_0_0_0_calc(0.05em+1px)_color-mix(in_oklab,currentColor_28%,transparent)]"
    >
      <SuitIcon suit={suit} className="text-[0.4em]" />
      <span className="font-index block text-[1.5em] font-bold [line-height:0.72]">{rank}</span>
      <SuitIcon suit={suit} className="rotate-180 text-[0.4em]" />
    </span>
  );
}

// ─────────────────────────────────────────────
// Back
// ─────────────────────────────────────────────

/** Diagonal lattice clipped to a rect, as one path (no defs/ids, safe to repeat). */
function latticePath(x0: number, y0: number, x1: number, y1: number, step: number): string {
  const parts: string[] = [];
  const r = (value: number) => Math.round(value * 100) / 100;
  // y = x + c
  for (let c = y0 - x1 + step / 2; c < y1 - x0; c += step) {
    const xa = Math.max(x0, y0 - c);
    const xb = Math.min(x1, y1 - c);
    if (xb > xa) parts.push(`M${r(xa)} ${r(xa + c)}L${r(xb)} ${r(xb + c)}`);
  }
  // y = -x + c
  for (let c = x0 + y0 + step / 2; c < x1 + y1; c += step) {
    const xa = Math.max(x0, c - y1);
    const xb = Math.min(x1, c - y0);
    if (xb > xa) parts.push(`M${r(xa)} ${r(c - xa)}L${r(xb)} ${r(c - xb)}`);
  }
  return parts.join('');
}

const BACK_LATTICE = latticePath(11, 11, 89, 129, 7.8);
/** Index-only sizes: a few coarse lines (fine ones turn to moiré at ~30px). */
const BACK_LATTICE_COARSE = latticePath(13, 13, 87, 127, 26);
/** Six-petal rosette at the medallion center (classic guilloche figure). */
const ROSETTE_ANGLES = [0, 30, 60, 90, 120, 150] as const;

/**
 * Engraved navy back on a 100×140 grid: navy margin, fine ivory rule, field
 * with a brass lattice, and the oval medallion the pot medallion echoes.
 * Index-only sizes drop the lattice and rosette (no moiré at ~30px).
 */
function CardBack({ detailed }: { detailed: boolean }) {
  return (
    <svg viewBox="0 0 100 140" aria-hidden focusable="false" className="absolute inset-0 block size-full">
      <rect x="6" y="6" width="88" height="128" rx="5" fill="var(--color-ink-3)" />
      <path
        d={detailed ? BACK_LATTICE : BACK_LATTICE_COARSE}
        fill="none"
        stroke="var(--color-brass)"
        strokeOpacity={detailed ? 0.42 : 0.5}
        strokeWidth={detailed ? 0.75 : 1}
        vectorEffect={detailed ? undefined : 'non-scaling-stroke'}
      />
      <rect
        x="6"
        y="6"
        width="88"
        height="128"
        rx="5"
        fill="none"
        stroke="var(--color-ivory)"
        strokeOpacity="0.7"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={detailed ? 11 : 13}
        y={detailed ? 11 : 13}
        width={detailed ? 78 : 74}
        height={detailed ? 118 : 114}
        rx="2.5"
        fill="none"
        stroke="var(--color-vermilion)"
        strokeOpacity="0.8"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {detailed ? (
        <>
          <ellipse
            cx="50"
            cy="70"
            rx="21"
            ry="29"
            fill="var(--color-ink-2)"
            stroke="var(--color-brass)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <ellipse
            cx="50"
            cy="70"
            rx="17"
            ry="24.5"
            fill="none"
            stroke="var(--color-brass)"
            strokeOpacity="0.5"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <g fill="none" stroke="var(--color-brass)" strokeOpacity="0.8" strokeWidth="0.8">
            {ROSETTE_ANGLES.map((angle) => (
              <ellipse key={angle} cx="50" cy="70" rx="9.5" ry="3.2" transform={`rotate(${angle} 50 70)`} />
            ))}
          </g>
        </>
      ) : (
        // Small print: a solid brass rosette on a navy disc (an outlined oval would read as "0").
        <>
          <circle cx="50" cy="70" r="17" fill="var(--color-ink-2)" />
          <g fill="var(--color-brass)">
            {ROSETTE_ANGLES.map((angle) => (
              <ellipse key={angle} cx="50" cy="70" rx="13" ry="4.6" transform={`rotate(${angle} 50 70)`} />
            ))}
          </g>
          <circle cx="50" cy="70" r="3.4" fill="var(--color-ink-2)" />
        </>
      )}
    </svg>
  );
}
