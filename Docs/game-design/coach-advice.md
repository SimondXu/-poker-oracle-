# CoachAdvice: the coach's data contract

Status: proposed, revision 2 (2026-10-12), after an architecture review. Not implemented. Phase 1 of the coach work; the post-hand review and LLM commentary (phase 2) build on this contract.

## Summary

The coach should advise the hero with the same policy the bots play, and show the numbers behind it. Today it runs a separate deterministic TAG baseline in the browser, without opponent stats, inside the render path.

This spec defines one structured `CoachAdvice` object:

- built by `strategy-engine` by running the decision functions in `decide.ts` through a small `Chooser` seam;
- computed on the server from the hero's own view (the same projection the hero already receives);
- sent only to the hero.

The web renders it. Reason text comes from reason codes through the existing en/zh i18n.

## Problem

- **Two policies.** Bots play `chooseBotAction` (`packages/strategy-engine/src/decide.ts`): mixed postflop play, a preflop price check, an opponent model. The coach calls `analyzeTrainingSpot` (`training.ts`), which reduces the preflop mix to its argmax and uses its own postflop thresholds. The two disagree, and the coach has no frequencies to show.
- **Frequencies exist only implicitly.** `decide.ts` draws `rng()` in the middle of its branches (`decide.ts:147, 221, 236, 243, 245, 256, 263, 275`).
- **No opponent model in the coach.** Opponent tendencies (`RuntimeRoom.playerStats`) exist only on the server, so the web's ranges use the TAG prior for everyone.
- **Render-path cost.** `getGameScreenState` calls `analyzeTrainingSpot` on every state update; postflop that is a Monte Carlo over opponent ranges.
- **Noise.** Equity is a Monte Carlo estimate with a standard error of about 0.04 at the bots' iteration counts, larger than `CALL_MIX_WIDTH` (0.025, `decide.ts:25`). In a review measurement (tag, heads-up, 200-300 seeds per spot), QTo on K72 facing a two-thirds-pot bet had a true call frequency near 0.40. A single estimate displayed anything from 0.06 to 0.82 (p10-p90). Several hard thresholds can flip on noise: `MIN_VALUE_BET_EQUITY` 0.5, `SLOWPLAY_MIN_EQUITY` 0.8, `valueBetMinEquity`, `semiBluffMinEquity`, the 0.9 jam threshold, and the preflop price check. A coach that shows one noisy estimate's frequencies would give opposite advice in nearly identical spots. These numbers are re-measured in step 1e.

## Goals

1. **One policy.** The coach's options, sizes and frequencies come from executing the same decision functions `chooseBotAction` uses, not a parallel copy.
2. **A typed, string-free contract.**
   - Options with sizes and frequencies.
   - Equity, its standard error, and what it was computed against.
   - Required equity, pot odds, SPR, effective stack, position, scenario.
   - Per-option reason codes with parameters.
   - A stability flag.
3. **Opponent stats without hidden information.** The hero's advice uses opponent stats, and its inputs are a whitelist projection of what the hero can see.
4. **No Monte Carlo in the browser.**
5. **Joinable.** Each advice carries enough to be joined to the hero's actual action and to stand alone as an eval sample (post-hand review, phase 2).

## Non-goals

- The post-hand review UI and grading (built next, on this contract).
- LLM commentary (phase 2).
- Visual design of the mix and reasons in `CoachView` / `CoachHint` (a separate design pass within `apps/web/DESIGN.md`).
- Changing bot strategy or strength. The seam must leave bot play bit-identical.
- Fixing the `rangeCache` key (see Risks); it ships as its own change with an eval rerun.
- An "act first, then see the advice" teaching mode (open question).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| What the coach shows | The TAG policy's play at a precise equity estimate, not the bots' realised frequencies | Bots' realised mix is mostly Monte Carlo noise near the price; the coach should show the policy, labelled as such |
| Personality | `tag` only, field kept in the contract | It beats every probe opponent and doesn't lose to lag or fish within the confidence intervals (`bot-eval.md`); a second style doubles eval and golden-set work |
| Where computed | Server, from `buildViewerHand(room, heroId)`, sent only to the hero in a `game:coach` event right after `game:action_required` | No hidden information by construction, one engine version, phase 2 needs it server-side |
| Coach toggle off | Server still computes | The post-hand review most needs advice for hands played without hints; cost is about one bot decision |
| Off-turn view | Preflop: hand percentile (table lookup) and position. Postflop: position and "the suggestion appears on your turn" | PRODUCT principle 4 (quiet except at the decision point); no per-street push |
| Mixed spots | The contract always carries the full mix (at most four options). UI rule, not contract: commit to a verdict when the top option is ≥ 0.65, otherwise show the mix; when `stable` is false always say "close" | Keeps presentation rules out of the data |

## Current context

- **Context builder.** `buildDecisionContext(hand, actorId, valid, statsById?)` (`context.ts:237`) is the one builder for server bots and the web coach. It reads only the actor's hole cards (`context.ts:245, 278`).
- **Stats.** `recordHandStats` (`context.ts:207-234`) updates stats at hand end by replaying the public action log only.
- **Server bots.** `buildBotDecisionContext` (`apps/server/src/game-loop/bot-support.ts:137`) builds the context with `room.playerStats`. Note that `toDecisionHand` spreads the whole engine hand (`bot-support.ts:147-149`), so at runtime the object still carries `deck` and every player's `holeCards`.
- **Hero delivery.** `game:action_required` is built in `buildActionRequiredPayloadForSocket` (`apps/server/src/ws/emitters.ts`). It is sent only to the human actor's own sockets, once per state change and once on reconnect.
- **Client.** It holds `action_required` in its hold queue with the state it belongs to.
- **rng order.** `chooseBotAction` draws `calcThinkingDelay` first (`decide.ts:295`).
  - **Preflop:** one `sampleIntent` draw (`decide.ts:147`), then at most one price-check Monte Carlo (`decide.ts:150, 155`; the two branches are mutually exclusive).
  - **Postflop:** `analyzePostflop` first (`decide.ts:186`), then short-circuited chance draws.
  - **No rng:** `readOwnRange`, `shouldJamPostflop`, `selectPostflopSizeFraction` and `buildOpponentRange` draw nothing.
- **Interim fields.** `TrainingAnalysis.sizing`, `equityVs` and `spr`, added on this branch, and the web formatters `suggestionText`, `sizeText` and `formatSpr` carry over to this contract.

## Proposed design

### 1. The Chooser seam in `decide.ts`

The decision functions keep their direct style. The only change is that every random choice and every equity estimate goes through two injected interfaces:

```ts
interface Chooser {
  /** Bot: one rng() draw, rng() < p. Enumeration: a branch point. */
  chance(p: number, why?: CoachReason): boolean;
  /** Bot: sampleIntent's single draw. Enumeration: up to four branches. */
  pick(mix: Mix, why?: CoachReason): ActionIntent;
  /** Records a deterministic fact on the current path; a no-op for bots. */
  note(why: CoachReason): void;
}

interface Equities {
  postflop(): PostflopAnalysis;
  /** Equity against the ranges of players who put chips in voluntarily; null when there are none. */
  preflopVsCallers(): number | null;
}
```

**Bot mode (`chooseBotAction`):**
- `chance` is `rng() < p` and `pick` is `sampleIntent(mix, rng)`.
- The two equities are lazy, use the same `rng`, and are evaluated at today's call sites.
- `calcThinkingDelay` stays first. The draw order is unchanged by construction.
- Rules that keep it bit-identical:
  - `chance` always draws, even when `p` is 0, 1 or above 1 (for example `drawBetFrequency` can be 1, and LAG's air bet frequency × 1.35 can exceed 1);
  - a `chance` call stays behind the same short-circuit guards as today.

**Enumeration mode (coach):**
- `enumerateDecision(context, chooserOptions)` re-executes the decision function by depth-first search over choice points. Each run follows a scripted prefix and branches at the first new choice point.
- `pick` branches use the cumulative thresholds `sampleIntent` uses (jam gets the remainder), so an unnormalised mix gives the same probabilities.
- `chance` probabilities are clamped to [0, 1], and zero-probability branches are pruned.
- Each path's probability is the product of its branch probabilities; identical leaf actions are merged.
- Equities are memoised and computed once with the coach's own rng and higher iterations. Every branch therefore uses the same estimate. This also fixes the bot path, where facing a shove each intent branch re-ran its own price-check Monte Carlo.
- A decision has at most a handful of leaves, and everything except the Monte Carlo costs microseconds, so re-execution is cheap.

**Bot-only adjustments stay out:** the preflop anti-streak nudge (`applyPreflopAntiStreakAdjustment`) needs `options.isFirstPreflopDecision`, which the coach never sets.

### 2. Stability

The coach's equity comes with a standard error, so the advice states whether the error matters:

- The standard error is the bound √(ê(1−ê)/N) for a mean of N draws in [0, 1] (ties count half), and 0 for an exact heads-up river. The bound matches the measured σ (step 1e), so no estimator returns its variance and the bots' functions are unchanged.
- 512 iterations per street (step 1e). Mean σ is about 0.0115 (worst case 0.5/√512 ≈ 0.022). A heads-up river uses exact enumeration over the range (σ = 0, about 13 ms).
- After enumerating at the estimate ê, enumerate again with injected equity ê − 2σ and ê + 2σ. Injection makes these nearly free.
- `stable` is false when the top option changes, or any option's frequency moves by more than 0.25, across the three runs.
- Frequencies in the contract are exact, except that options under 0.5% are dropped and the rest renormalised: the call logistic leaves a fold of about 1e-11 far from the price. The UI rounds them to 5%.

### 3. The contract (`packages/shared`)

```ts
export const COACH_POLICY_VERSION = '2026-10-12.1'; // bump when decide.ts behaviour changes

export type CoachStreet = 'preflop' | 'flop' | 'turn' | 'river';
/** Shared by advice options and the hero's recorded action, so the review compares like with like. */
export type CoachActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
export function classifyAction(action, spot): CoachActionKind; // an all-in that doesn't raise is a call

export interface CoachOption {
  kind: CoachActionKind;
  /** Street total for bet / raise / all_in, like raise_to. */
  to?: number;
  /** bet / raise only: big blinds before the flop; afterwards chips added beyond a call as a share of the pot after calling. */
  size?: { unit: 'bb' | 'pot'; value: number };
  /** 0..1; the options sum to 1. */
  frequency: number;
  /** The facts and chance points on the paths that lead to this option, most important first. */
  reasons: CoachReason[];
}

export interface CoachAdvice {
  policyVersion: string;
  personality: 'tag';

  // Join keys for the post-hand review. The engine hand has no id; the client's is `${roomId}:${handNumber}`.
  handId: string;
  street: CoachStreet;
  /** hand.actions.length when advised: the hero's action lands at this index. */
  actionIndex: number;
  stateVersion: number;

  /** What the hero saw, so a stored advice is a self-contained eval sample. */
  spot: { holeCards: [Card, Card]; board: Card[]; pot: number; toCall: number; heroStack: number; bigBlind: number };

  /** Highest frequency first. */
  options: CoachOption[];
  stable: boolean;

  /** Postflop, and preflop when the price check ran (then equityVs is 'range'). */
  equity?: number;
  equityStdErr?: number;
  equityVs?: 'range' | 'random';
  /** Preflop: share of starting hands this hand is in the top of (0.08 = top 8%). */
  handPercentile?: number;
  /** Only when there is a price to call. requiredEquity = clamp01(potOdds + callBuffer), as in decide.ts:177, 273. */
  potOdds?: number;
  requiredEquity?: number;

  /** Postflop only: effective stack over the pot as the street began. */
  spr?: number;
  effStackBb: number;
  position: BotPosition;
  scenario: BotBettingState;
  opponents: number;

  /** Facts common to every option's path. */
  reasons: CoachReason[];
}
```

### 4. Reason codes

Only facts that a branch in `decide.ts` actually uses get a code. Each code is recorded at the branch named below, through `chooser.note` or the `why` of a `chance`/`pick`, so a reason is attached exactly to the options whose path went through it.

| Code | Params | Recorded at |
|---|---|---|
| `preflop_chart` | `handClass, scenario, position, effStackBb` | the `pick` over the preflop mix, `decide.ts:147` |
| `price_short` | `equity, required` | price check fails, `decide.ts:150`; call logistic's no-branch, `decide.ts:275` |
| `price_ok` | `equity, required` | all-in call has the price, `decide.ts:155`; call logistic's yes-branch, `decide.ts:275` |
| `jam` | `trigger: 'short_stack' \| 'low_spr' \| 'near_lock', effStackBb, spr` | `shouldJamPostflop` true, `decide.ts:188` |
| `value` | `equity` | `isValue`, `decide.ts:229-232`; value raise, `decide.ts:256`; fallback value bet, `decide.ts:219` |
| `slowplay` | `equity` | the slowplay chance, `decide.ts:236` |
| `draw` | `draw: 'flush' \| 'oesd' \| 'pair_plus_draw'` | draw bet, `decide.ts:243`; semi-bluff raise, `decide.ts:263` |
| `bluff_share` | `frequency` | the air bet chance, `decide.ts:245` |
| `cbet` | `frequency` | the fallback c-bet chance, `decide.ts:221` |
| `no_initiative` | none | check without initiative, `decide.ts:240` |
| `sticky_opponent` | `playerId, foldToBet, facingBets` | `opponentFolds` false, `decide.ts:206` |

- **Stat params are the smoothed estimates the policy used.** `foldToBet` is the Beta-smoothed rate from `estimateTendencies` (`range.ts:83`), and the denominator is `postflopFacingBets`, not hands.
- **Deferred:**
  - `habitual_shover`: range widening happens inside the cached `buildOpponentRange` (`range.ts:110-113, 219-221`), not at a `decide.ts` branch. It needs a pure `explainOpponentRange(view)` that reuses `estimateTendencies` and `widenedShare`.
  - `position` and `multiway`: no TAG branch uses them directly.
- **Ranking:** fixed priority per code; at most three per option.
- **Rendering:** the web maps each code to `panel.coach.why.<code>` (en and zh) through a `Record<CoachReason['code'], …>`, so a missing code fails typecheck. Values are numbers or ids; the web formats them and resolves `playerId` to a name.
- **Copy:** "the policy bets because…", never "you must".

### 5. Where advice is computed

`strategy-engine/src/coach.ts` builds the advice. On the server, `apps/server/src/ws/view-models/hero-coach.ts` projects the viewer hand (`toDecisionView`) and builds the event (`buildHeroCoachEvent`); `ws/emitters.ts` schedules it. The event type `GameCoachEvent` is in `packages/shared`.

```ts
// strategy-engine: no RuntimeRoom, no engine state.
export function buildCoachAdvice(view: DecisionHand, heroId: string, valid: DecisionValidActions,
  stats: ReadonlyMap<string, BotPlayerStats>, seed: string, keys: JoinKeys): CoachAdvice | null;
```

- The server passes `buildViewerHand(room, heroId)` as `view`: the exact projection the hero already receives (`apps/server/src/ws/view-models/viewer-hand.ts`). Other players' hole cards are absent there, and there is no deck. So "no hidden information" follows from the input, not from how the engine code happens to read it.
- **Seed:** `${room.id}:${handNumber}:${heroId}:${actionIndex}`. The advice never touches the room rng. The same spot gives the same advice on every rebuild, so v1 needs no cache.
- **Delivery:** a follow-up `game:coach` event to the actor's own sockets, emitted on the next tick after `game:action_required` (step 1e), so the hero's controls never wait for the Monte Carlo. The event carries `stateVersion`. The client keeps an advice only while it matches the current `validActions`, and drops a late one for a decision already made. Nothing about advice goes into `game:state`, `game:event` or `game:hand_result`.
- **Failure isolation:** advice is built inside `try/catch`. If it throws, `action_required` still goes out without `coach`. A coach bug must never leave the hero without their valid actions.

**Hidden-information invariants:**
1. **Inputs are public to the hero.** Inputs are the hero's own cards, the board, stacks, blinds, button, the public action log, and opponent stats from `recordHandStats`, which replays that log.
2. **Future stats must stay public.** A stat that uses shown-down cards may use only cards shown at showdown, never mucked ones.
3. **Delivery** goes only to the actor's own sockets; spectators, other players and bots never receive another player's advice.

**Alternative rejected: send opponent stats to the client and compute there.** Stats are public-derived, so it wouldn't leak, but:
- it keeps the Monte Carlo in the browser;
- it ships the engine to every client;
- client and server can drift between deploys;
- phase 2 needs the advice on the server anyway.

**Cost (step 1e, measured on an M4 Pro, warm caches, 300 decision points from seeded simulations, `scratchpad/measure/`):**

| Iterations | p50 / p95 latency, all postflop | multiway p95 | mean σ | advice flips within ±2σ |
|---|---|---|---|---|
| 128 | 7 / 21 ms | 34 ms | 0.022 | 18% |
| 512 | 28 / 74 ms | 150 ms | 0.0115 | 10% |
| 1024 | 56 / 151 ms | 260 ms | 0.0085 | 7% |

- **Iteration count:** no count meets both p95 ≤ 50 ms and σ ≤ 0.02 for every spot. 512 is chosen because doubling it to 1024 removes only 3 more points of flips for twice the time.
- **Flip criterion:** a flip means the top option changes, or some option's frequency moves more than 0.25, at ê ± 2σ. At 512 the flips are concentrated on the flop (15%) and turn (13%); the heads-up river never flips.
- **Delivery:** the 74/150 ms p95 is why advice goes out as a follow-up event instead of on `action_required`.
- **Worker thread:** the event loop is still blocked for about 30 ms (p50) per human decision. Moving advice to a worker thread is deferred until event-loop lag is measured to matter.

### 6. The web

- `gameStore` stores `coach` with `validActions` and clears it with them.
- `getGameScreenState` no longer calls `analyzeTrainingSpot`. `training-analysis.ts` became `coach-data.ts`: position labels, the preflop percentile lookup for the off-turn view, and the advice while the hero's decision is open.
- `training.ts` (`analyzeTrainingSpot`, the deterministic baseline and its Chinese reasons) is deleted, with the unused `components/game/hud/training-hud-state.ts` that only its own test imported.
- The render path then only formats an object; this completes "move coach analysis out of the render path".

## Implementation plan

1. **Engine only, prove the risky assumptions.**
   - a. **Digest guard before touching `decide.ts`.** A server test records every bot decision, `(type, amount, thinkingDelayMs)`, in seeded duplicate heads-up deals through `playHalfDeal`'s `onDecision` (`tag` vs `tag-random`, `lag` vs `fish`). It also records the JSON report of a seeded 6-max `simulateBotStats` run with `includeTrainingTable: false`, which covers multiway pots, the anti-streak options and the 10bb segment. It hashes all of this and asserts the hash.
   - b. **Simulator baseline.** Capture the simulator JSON with timing fields removed (commands under Validation), at most three runs at once.
   - c. **Add the `Chooser` / `Equities` seam.** The digest and the simulator JSON must be unchanged.
   - d. **Add `enumerateDecision` and its tests.** With a fixed injected analysis, the enumerated frequencies equal the sampled frequencies.
   - e. **Measure** (scratch script, not committed): over about 300 hero decision points from a seeded simulation, record p50/p95 latency at 128, 512 and 1024 iterations, and the ±2σ flip rate.
   - **Decision gate (decided):** 512 iterations and a follow-up `game:coach` event; see "Cost" above.
   - Steps a-e are done: the digest test and the simulator JSON were unchanged after the seam.
2. **Contract and `buildCoachAdvice`.** Shared types and `buildCoachAdvice` with contract tests.
3. **Server.** Viewer projection, seed, try/catch, attachment; delivery tests and the leak property test.
4. **Web.** Store, minimal render, client analysis removed; browser checks.
5. **Separate PR.** `rangeCache` key fix and an eval rerun.
6. **Design review, then the post-hand review.** The server records `{advice, heroAction}` per hand and joins them.

## Validation

1. **Bot play unchanged (step 1).**
   - The digest test passes before and after the seam.
   - The simulator JSON is identical after removing timing fields. Run these at most three at a time, then check that `pgrep -f bot-simulator` is empty:
     ```bash
     cd apps/server
     pnpm -s simulate:bots --hands 200 --seed 20261011 --json --no-training-table | jq 'del(.elapsedMs, .handsPerSecond)'
     pnpm -s simulate:bots --mode duplicate-hu --a tag --b tag-random --hands 100 --seed 20261011 --json | jq 'del(.elapsedMs, .handsPerSecond)'
     pnpm -s simulate:bots --mode duplicate-hu --a lag --b fish --hands 100 --seed 20261011 --json | jq 'del(.elapsedMs, .handsPerSecond)'
     ```
2. **Enumeration matches sampling.**
   - With the analysis injected (no Monte Carlo), sample bot mode 20,000 times per context and compare with `enumerateDecision`; each frequency must be within 1.5 points. Contexts cover:
     - a preflop open;
     - a preflop shove with the price check;
     - an unopened flop with value, a draw, and air;
     - a bet near the price.
   - Frequencies sum to 1.
3. **No leak.** Collect about 200 hero decision points from a seeded 6-max simulation, including multiway and river spots. For each, the advice is deep-equal after permuting opponents' hole cards and the undealt deck. Also, `recordHandStats` gives the same stats when the hole cards are permuted.
4. **Delivery.**
   - The actor's socket gets `coach`.
   - Other players and spectators get no `action_required`.
   - A bot actor gets no advice.
   - A reconnect gets the same advice.
   - If advice throws, `action_required` is still sent.
5. **Contract.**
   - The options' frequencies sum to 1 ± 1e-9, sorted descending.
   - `size` is present exactly for bet and raise.
   - `requiredEquity` equals `clamp01(potOdds + callBuffer)`.
   - `classifyAction` maps a non-raising all-in to `call`.
   - The unopened-street regression (`training-analysis.test.ts`) moves here: a bet is offered when nobody has bet.
6. **i18n:** every `CoachReason['code']` has en and zh messages (compile-time `Record`, plus a test over the zh table).
7. **Latency:** the hero's `action_required` is sent before advice is computed (a server test checks the emit order). Advice latency is logged so event-loop impact can be watched.
8. **Browser** (review-server / review-web, both languages, 1440 and 375 wide):
   - options with frequencies and sizes;
   - reasons as text;
   - "close" when unstable;
   - coach off hides it;
   - a reload during the hero's turn returns the same advice.
9. `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.

## Risks

- **`rangeCache` key.** The key rounds `effectiveStackBb` (`range.ts:216`), but the range is built from preflop mixes bucketed at 12/25/60bb (`range.ts:120`, `preflop-hands.ts:326-336`). For example, 24.6bb and 25.4bb share a key but belong to different buckets. Results therefore depend on cache insertion order, and a coach computation can change a later bot decision in that rare case. Until the separate fix lands, the leak test runs in a fresh process (or clears the cache) to avoid false failures.
- **Seam drift.** A seam that changes the draw order would invalidate `bot-eval.md`. The digest test localises the first differing decision. If bit-identity can't be reached, rerun the eval table and report the difference rather than claim no change.
- **Precision vs latency.** Step 1e measures both; `stable` covers the remaining noise.
- **Reasons read as certainty.** Copy review in the design pass.

## Open questions

1. An "act first, then see the advice" mode for learning: a product decision, outside this phase.
2. Unify opponent stats: the Opponents tab computes its own on the client with different definitions from the server's `BotPlayerStats`. Should the server's stats become the single source? Deferred.
