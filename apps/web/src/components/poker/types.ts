/** Shared vocabulary for poker primitives (plain .ts so pure libs and node tests can import it). */

export type CardSize = 'sm' | 'md' | 'lg' | 'xl';

/** Visual action kind for ActionTag and log colors. Engine `raise_to` maps to `raise`. */
export type ActionTagKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';

export type BlindKind = 'SB' | 'BB';
