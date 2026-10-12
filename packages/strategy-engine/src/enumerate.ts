import type { BotDecisionContext, BotPersonality, CoachReason } from '@aipoker/shared';
import type { ActionIntent, BotActionWithoutThinking, ChooseBotActionOptions, Mix } from './types.ts';
import { clamp01 } from './cards.ts';
import { decide, type Chooser, type Equities } from './decide.ts';

export interface DecisionOutcome {
  action: BotActionWithoutThinking;
  probability: number;
  /** Facts noted on any path that ends in this action, in the order first noted. */
  reasons: CoachReason[];
}

const INTENTS: readonly ActionIntent[] = ['fold', 'call', 'raise', 'jam'];

/** What `sampleIntent` gives each intent: one draw in [0, 1) against cumulative thresholds; jam takes the rest. */
function intentProbabilities(mix: Mix): number[] {
  let edge = 0;
  let cumulative = 0;
  const probabilities = [mix.fold, mix.call, mix.raise].map((weight) => {
    cumulative += weight;
    const next = Math.max(edge, clamp01(cumulative));
    const probability = next - edge;
    edge = next;
    return probability;
  });
  return [...probabilities, 1 - edge];
}

/**
 * Every action `decide` can take in this spot, with its probability. It re-runs the same decision
 * code once per path through its random choices, so the frequencies are the bots' policy, not a
 * copy of it. `equities` should be memoised: every path then uses the same estimate.
 * `context` is used as given; strip opponent history first for a personality that doesn't adapt.
 */
export function enumerateDecision(
  context: BotDecisionContext,
  personality: BotPersonality,
  equities: Equities,
  options: ChooseBotActionOptions = {},
): DecisionOutcome[] {
  const outcomes = new Map<string, DecisionOutcome>();
  // Each script fixes the branches taken at the first choice points; the run takes the first live branch after it.
  const pending: number[][] = [[]];

  while (pending.length > 0) {
    const script = pending.pop()!;
    const taken: number[] = [];
    const reasons: CoachReason[] = [];
    let probability = 1;

    const choose = <T>(branches: ReadonlyArray<{ value: T; p: number }>): T => {
      let index = script[taken.length];
      if (index === undefined) {
        const live = branches.flatMap((branch, i) => (branch.p > 0 ? [i] : []));
        index = live[0] ?? 0;
        for (const other of live.slice(1)) {
          pending.push([...taken, other]);
        }
      }
      taken.push(index);
      probability *= branches[index]!.p;
      return branches[index]!.value;
    };

    const chooser: Chooser = {
      chance: (p) => {
        // A bot's rng() < NaN is never true.
        const yes = Number.isNaN(p) ? 0 : clamp01(p);
        return choose([
          { value: true, p: yes },
          { value: false, p: 1 - yes },
        ]);
      },
      pick: (mix) => {
        const probabilities = intentProbabilities(mix);
        return choose(INTENTS.map((value, i) => ({ value, p: probabilities[i]! })));
      },
      note: (reason) => {
        reasons.push(reason);
      },
    };

    const action = decide(context, personality, chooser, equities, options);
    const key = JSON.stringify(action);
    const existing = outcomes.get(key);
    if (existing) {
      existing.probability += probability;
      const seen = new Set(existing.reasons.map((reason) => JSON.stringify(reason)));
      existing.reasons.push(...reasons.filter((reason) => !seen.has(JSON.stringify(reason))));
    } else {
      outcomes.set(key, { action, probability, reasons });
    }
  }

  return [...outcomes.values()].sort((left, right) => right.probability - left.probability);
}
