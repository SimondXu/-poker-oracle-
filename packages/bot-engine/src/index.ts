import type { BotAction, BotPersonality, BotValidActions } from '@aipoker/shared';

export type BotRng = () => number;

// ─── Personality configuration ───────────────────────────────────────────────

interface PersonalityConfig {
  /** Minimum hand strength to call (vs a bet) */
  callThreshold: number;
  /** Minimum hand strength to consider raising */
  raiseThreshold: number;
  /** Probability of raising when strength >= raiseThreshold */
  raiseFrequency: number;
  /** Probability of bluffing (raising with any hand) */
  bluffFrequency: number;
  /** Pot-fraction for bet/raise sizing (e.g. 0.75 = 3/4 pot) */
  betSizingFactor: number;
  /** [min, max] thinking delay in ms */
  thinkingRange: [number, number];
}

const PERSONALITY_CONFIG: Record<BotPersonality, PersonalityConfig> = {
  fish: {
    callThreshold: 0.15,   // calls almost anything
    raiseThreshold: 0.82,  // only raises near-monsters
    raiseFrequency: 0.30,
    bluffFrequency: 0.03,
    betSizingFactor: 0.50,
    thinkingRange: [500, 1800],
  },
  tag: {
    callThreshold: 0.40,   // tight range
    raiseThreshold: 0.65,  // raises strong hands
    raiseFrequency: 0.75,
    bluffFrequency: 0.12,
    betSizingFactor: 0.75,
    thinkingRange: [1000, 2500],
  },
  lag: {
    callThreshold: 0.28,   // wider calling range
    raiseThreshold: 0.50,  // raises frequently
    raiseFrequency: 0.85,
    bluffFrequency: 0.28,
    betSizingFactor: 1.00,
    thinkingRange: [1200, 3000],
  },
};

// ─── Hand strength evaluation ─────────────────────────────────────────────────

const RANK_VALUE: Record<string, number> = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14,
};

/**
 * Preflop hand strength using a simplified Chen-formula approximation.
 * Returns a value in [0, 1].
 */
function preflopStrength(holeCards: readonly string[]): number {
  if (holeCards.length < 2) return 0.5;
  const c1 = holeCards[0]!;
  const c2 = holeCards[1]!;

  const r1 = RANK_VALUE[c1[0]!] ?? 7;
  const r2 = RANK_VALUE[c2[0]!] ?? 7;
  const suited = c1[1] === c2[1];
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const isPair = r1 === r2;
  const gap = high - low;

  let score: number;
  if (isPair) {
    // AA → 1.0, 22 → 0.20
    score = 0.20 + ((high - 2) / 12) * 0.80;
  } else {
    const highBase  = ((high - 2) / 12) * 0.55 + 0.10;
    const lowBonus  = ((low  - 2) / 12) * 0.10;
    const suitBonus = suited ? 0.05 : 0;
    const gapPen    = Math.min(gap, 4) * 0.03;
    score = highBase + lowBonus + suitBonus - gapPen;
  }
  return Math.max(0.05, Math.min(0.98, score));
}

/**
 * Post-flop hand strength based on current made hand (no Monte Carlo).
 * Returns a value in [0, 1].
 */
function postflopStrength(
  holeCards: readonly string[],
  communityCards: readonly string[],
  rng: BotRng,
): number {
  const allCards = [...holeCards, ...communityCards];
  const ranks  = allCards.map((c) => RANK_VALUE[c[0]!] ?? 2);
  const suits  = allCards.map((c) => c[1]!);

  // Rank frequencies
  const rankFreq = new Map<number, number>();
  for (const r of ranks) rankFreq.set(r, (rankFreq.get(r) ?? 0) + 1);
  const freqs = [...rankFreq.values()].sort((a, b) => b - a);

  // Suit frequencies
  const suitFreq = new Map<string, number>();
  for (const s of suits) suitFreq.set(s, (suitFreq.get(s) ?? 0) + 1);
  const hasFlushDraw = [...suitFreq.values()].some((v) => v >= 4);
  const hasFlush     = [...suitFreq.values()].some((v) => v >= 5);

  // Straight detection (simplified)
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
  let hasStraight = false;
  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    const w = uniqueRanks.slice(i, i + 5);
    if (w[4]! - w[0]! === 4 && w.length === 5) { hasStraight = true; break; }
  }

  let base: number;
  if      (freqs[0] === 4)                       base = 0.92; // quads
  else if (freqs[0] === 3 && freqs[1] === 2)     base = 0.86; // full house
  else if (hasFlush && hasStraight)               base = 0.92; // straight flush
  else if (hasFlush)                              base = 0.80; // flush
  else if (hasStraight)                           base = 0.76; // straight
  else if (freqs[0] === 3)                        base = 0.68; // trips
  else if (freqs[0] === 2 && (freqs[1] ?? 0) === 2) base = 0.55; // two pair
  else if (freqs[0] === 2)                        base = 0.42; // one pair
  else if (hasFlushDraw)                          base = 0.35; // flush draw
  else                                            base = 0.26; // high card

  // Add a small noise so the bot doesn't play robotically
  return Math.max(0.05, Math.min(0.98, base + (rng() - 0.5) * 0.06));
}

// ─── Core decision logic ──────────────────────────────────────────────────────

function calcThinkingDelay(rng: BotRng, personality: BotPersonality): number {
  const [min, max] = PERSONALITY_CONFIG[personality].thinkingRange;
  return Math.floor(min + rng() * (max - min));
}

/**
 * Main exported function.
 *
 * @param actions  - Full valid-action set plus decision context
 * @param personality - 'fish' | 'tag' | 'lag'
 * @param rng      - Injectable RNG (default: Math.random)
 */
export function chooseBotAction(
  actions: BotValidActions,
  personality: BotPersonality = 'fish',
  rng: BotRng = Math.random,
): BotAction {
  const cfg = PERSONALITY_CONFIG[personality];
  const thinkingDelayMs = calcThinkingDelay(rng, personality);

  // Hand strength
  const strength =
    actions.communityCards.length === 0
      ? preflopStrength(actions.holeCards)
      : postflopStrength(actions.holeCards, actions.communityCards, rng);

  // Pot odds — minimum strength needed to justify a call
  const potOdds =
    actions.potTotal > 0
      ? actions.callAmount / (actions.potTotal + actions.callAmount)
      : 0;
  const callThreshold = Math.max(cfg.callThreshold, potOdds);

  // ── Raise / Bet ───────────────────────────────────────────────────────────
  const wantsToRaise =
    actions.canRaise &&
    (
      (strength >= cfg.raiseThreshold && rng() < cfg.raiseFrequency) ||
      rng() < cfg.bluffFrequency
    );

  if (wantsToRaise) {
    // Size: cfg.betSizingFactor × pot, with ±15% noise
    const targetAmount = Math.round(
      actions.potTotal * cfg.betSizingFactor * (1 + (rng() - 0.5) * 0.30),
    );
    const amount = Math.max(
      actions.minRaiseTo,
      Math.min(actions.maxRaiseTo, targetAmount),
    );

    if (actions.canAllIn && amount >= actions.maxRaiseTo) {
      return { type: 'all_in', thinkingDelayMs };
    }
    return { type: 'raise_to', amount, thinkingDelayMs };
  }

  // ── All-in with very strong hand ─────────────────────────────────────────
  if (actions.canAllIn && strength >= 0.88 && rng() < 0.15) {
    return { type: 'all_in', thinkingDelayMs };
  }

  // ── Call ──────────────────────────────────────────────────────────────────
  if (actions.canCall && strength > callThreshold) {
    return { type: 'call', amount: actions.callAmount, thinkingDelayMs };
  }

  // ── Check ─────────────────────────────────────────────────────────────────
  if (actions.canCheck) {
    return { type: 'check', thinkingDelayMs };
  }

  // ── Fold ──────────────────────────────────────────────────────────────────
  if (actions.canFold) {
    return { type: 'fold', thinkingDelayMs };
  }

  // Fallback — should never reach here
  return { type: 'check', thinkingDelayMs };
}
