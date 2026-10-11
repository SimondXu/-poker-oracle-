/** Shared vocabulary for poker primitives (plain .ts so pure libs and node tests can import it). */

/**
 * Card size step. Also picks the print detail: `xs`/`sm` are index-only
 * (rank + suit in two mirrored corners, legible at ~30px wide); `md`+ add the
 * center pip or the framed court panel and the engraved back lattice.
 */
export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Visual action kind for ActionTag and log colors. Engine `raise_to` maps to `raise`. */
export type ActionTagKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';

export type BlindKind = 'SB' | 'BB';

/** Card box in em of the card's own font-size (true 5:7). */
export const CARD_EM = { w: 2.5, h: 3.5 } as const;

/** Highlighted (best-five) cards are raised by this much, in card em. */
export const CARD_HIGHLIGHT_RAISE_EM = 0.3;

/** Pot medallion box in em of its own font-size (side-pot line included). */
export const POT_MEDALLION_EM = { w: 10.5, h: 4.4 } as const;
