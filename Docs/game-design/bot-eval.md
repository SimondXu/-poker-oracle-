# Bot evaluation

How we tell whether a strategy change made the bots stronger, and the numbers so far.

## Method

Duplicate heads-up (`apps/server/src/tools/duplicate-hu.ts`): each deal is played twice on the same deck with the seats swapped, and A's result is the sum of both halves. That cancels most card luck. We report A's win rate in bb/100 hands with a 95% confidence interval (1.96 · sd / √n over deal pairs). 100bb stacks, blinds 10/20.

Policies: the rule bots `fish`, `tag`, `lag`; `tag-random` (TAG with equity against random hands, the pre-range baseline); and probe opponents that exist only in the harness: `station` (never folds, never raises), `maniac-shove` (all-in every decision), `overbettor` (bets or raises 1.5x pot with any hand), `size-reader` (plays TAG but folds to near-pot bets and raises bets of a third of the pot or less, to punish bet sizes that give away strength).

```bash
cd apps/server
pnpm simulate:bots --mode duplicate-hu --a tag --b station --hands 3000 --seed 20261011 --json
```

`--hands` counts deals, so 3000 deals is 6000 hands. A run with rule bots takes about 2 to 4 minutes (Monte Carlo equity); probe-only matchups are faster.

## Results (seed 20261011, 3000 deals each)

| A vs B | Baseline `b1df0c1` | Range equity `c98bb70` | + Price check, opponent model `e094e0a` | + Mixed postflop |
|---|---|---|---|---|
| tag vs tag-random | n/a | +78 ± 51 | +120 ± 45 | +83 ± 45 |
| tag vs station | +1132 ± 70 | +1516 ± 81 | +1698 ± 85 | +1697 ± 83 |
| tag vs overbettor | +337 ± 111 | +153 ± 103 | +404 ± 110 | +401 ± 109 |
| tag vs maniac-shove | +206 ± 127 | +206 ± 127 | +588 ± 119 | +588 ± 119 |
| tag vs size-reader | n/a | n/a | +87 ± 45 | +52 ± 40 |
| lag vs tag | −138 ± 73 | −82 ± 54 | −39 ± 45 | −35 ± 44 |
| tag vs fish | +30 ± 63 | −5 ± 47 | +1 ± 38 | −11 ± 39 |
| fish vs station | n/a | +1606 ± 82 | +568 ± 56 | not rerun |

- **Baseline**: equity against random hands.
- **Range equity**: postflop equity against each opponent's likely hands (preflop range from the TAG baseline mixes for their action, narrowed street by street by bet size, with a balanced bluff share of s/(1+2s) of each bet).
- **Price check, opponent model**: preflop calls (and calls for all the chips) are checked against equity versus the raiser's range, with raises far over a standard size read as a narrower range; position comes from who acts last after the flop; a deep near-lock bets instead of shoving. Each player's tendencies (VPIP, raise and shove rates, postflop aggression, fold to a bet) are counted hand by hand and smoothed with a Beta prior worth a dozen TAG-like hands; a player shown to be more aggressive or stickier than that gets a wider range, and a player who almost never folds gets no bluffs and bigger value bets. Fish ignores opponents' history on purpose.
- **Mixed postflop**: bet size depends only on the spot (a third of the pot on dry flops, two thirds on wet ones or multiway, three quarters on the river and for raises), so a set and a bluff bet the same. Each bot reads its own range the way it reads an opponent's, bets the value part (strong hands sometimes slowplay), bets strong draws often, and bets just enough air that bluffs make up the balanced s/(1+2s) of its bets, scaled by personality (Fish 0.4x, LAG 1.35x). Calls near the price are mixed instead of a hard cut-off. Against a player who rarely folds there are no bluffs or slowplays.

## Reading the numbers

- TAG now wins more than the baseline did against every probe opponent, beyond the confidence intervals, and beats its pre-range self by +120 ± 45. Against Fish it is unchanged within noise.
- The preflop price check alone (before the opponent model) made the bots fold to a player who shoves every hand: TAG vs `maniac-shove` fell to −23 ± 45. A real player could exploit that by shoving every hand, so the price check only ships together with the opponent model, which reads a habitual shover's range as any two cards.
- Fish against a calling station dropped from +1606 to +568 because Fish doesn't adapt: it keeps bluffing the station and doesn't size up its value bets. That is the intended difference between Fish and the adaptive personalities.
- `tag` vs `fish` stays within noise. Their preflop ranges are too similar to separate them in heads-up play.
- Mixed postflop play shows no measurable gain against these probes (every change is within the confidence intervals). That is expected: fixed probes don't adapt, so they can't punish a bot whose bet size reveals its hand, and balance only pays against an opponent who learns, like a human. Even `size-reader`, built to punish the old size tells, lost to the old TAG (+87). What the change buys is play that can't be read from bet sizes, which the tests check directly. A first version slowplayed and bet value only from the top of its own range even against a station, which cost about 200 bb/100 there (+1493); value betting and no slowplays against players who rarely fold brought it back. The `tag-fish`, `lag-tag` and `size-reader` numbers were measured before that fix, which only changes play against such players.

## Preflop chart and range cache (2026-10-12)

Two TAG chart changes for six-max (three or more players), found when the coach started showing how wide each seat plays, plus a cache fix:

- **Cutoff opens:** the cutoff opened 44% of hands at 100bb, as wide as the button (48%), because the weakest hand classes were widened for the cutoff and the button alike. The cutoff now keeps 65% of its marginal-hand opens and 20% of its trash opens; its other hands are unchanged. The chart's cutoff share is now about 29% (31% at 20bb).
- **Big blind defense against one open:** the big blind defended 24% of hands, so it folded hands whose equity against the opener's range cleared the price. Up to 0.3 of the fold probability of playable, speculative and marginal hands, and 0.06 of trash, now goes to calls, about 37% in all. The preflop price check still turns calls that lack the price into folds.
- **Range cache key:** ranges were cached by `Math.round(effectiveStackBb)`, but the charts read the stack by bucket (12/25/60bb). 24.6bb and 25.4bb shared a key across two charts, so results could depend on cache order. The key is now the bucket.

Heads-up charts are unchanged (a test pins them), so the heads-up table above stands. Checked with the same seed and 3000 deals: tag vs station +1697 ± 83 and tag vs tag-random +83 ± 45, the same as before.

Six-max ring (fish, tag and lag twice each, 6000 hands across 100/40/20/10bb, seed 20261011, `--no-training-table`):

| | Before | After |
|---|---|---|
| TAG raise-first-in from the cutoff | 33% | 25% |
| TAG raise-first-in from the button | 38% | 38% |
| TAG fold to an open (all seats) | 86% | 84% |
| TAG win rate, bb/100 | +11.9 ± 14 | +2.7 ± 14 |
| Fish win rate | −11.8 ± 16 | −4.3 ± 17 |
| LAG win rate | −0.1 ± 17 | +1.6 ± 18 |

The ring is not duplicated, so win rates move by luck as much as by play: the difference in TAG's rate is well inside the noise, and these runs can't show whether the change helps or costs. The bots fold to opens often (75-86%), which rewards wide steals, so a tighter cutoff may cost a little against them while being the standard play against people. The changes rest on standard ranges, not on a measured gain.

## Claude Haiku through Claude Code (2026-10-14)

The first CLI player run (`llm-bots.md`, "CLI players", step L1): `claude-haiku-5-5` through `claude -p` on the user's subscription, effort low, prompt `cli-proto-0` (sha256 `f5a054b3…`, the Analyst persona and the arm A1 brief), Claude Code 2.1.296. Run `20261014054614-d528`, secret seed 309780431 revealed at the end; 4 matches × 25 deals per opponent, and the rule bots replay the same deals as player A. Command: `pnpm --filter @aipoker/server eval:llm-hu`.

| A vs B | bb/100 | A − TAG, same deals | A − Fish, same deals |
|---|---|---|---|
| haiku vs station | +1080 ± 299 | −664 ± 398 | +646 ± 335 |
| fish vs station | +434 ± 219 | −1310 ± 426 | |
| tag vs station | +1744 ± 403 | | +1310 ± 426 |
| lag vs station | +1781 ± 428 | +37 ± 228 | +1347 ± 432 |
| haiku vs tag | +134 ± 198 | +59 ± 183 | +13 ± 258 |
| fish vs tag | +121 ± 183 | +46 ± 236 | |
| tag vs tag | +74 ± 182 | | −46 ± 236 |
| lag vs tag | −34 ± 181 | −109 ± 195 | −155 ± 201 |

- **Mechanics:** 1,271 decisions, 1,271 calls (cap 1,350). One CLI error fell back to TAG (0.1%); every other choice was valid. Wall time p50 4.4-5.3 s, p95 7.3-9.1 s, max 33.8 s; about 2,800 cached input and 420-580 output tokens per decision, 290-430 of them thinking, even at effort low. The isolation canary passed first, including its positive control.
- **Style:** VPIP 78%, PFR 49-69%, postflop aggression 38-55%, fold to a bet 47% against TAG (TAG's own 42.5%). Agreement with the TAG advice: 79% [76, 82] against the station, 84% [81, 87] against TAG; no price blunders in 159 decisions facing a bet.
- **What it shows:** Haiku beats the station by more than Fish does and holds its own against TAG, but it wins about 660 bb/100 less than TAG against the station. Against TAG, 100 deals can't separate it from the rule bots.

**Where Haiku loses value against the station.** It doesn't bluff it: at equity under 35% it bet 2 times in 201 spots. Its thin bets at 35-50% equity (38 of 98 spots, where TAG mostly checks) cost about 15 bb in all. The loss is sizing with near-locks. In 47 spots with equity of 80% or more where the TAG advice was all-in, Haiku moved in 8 times and bet 0.5-1.5 pot the other 39. On the river, where a station calls any size, that leaves (2·equity − 1) × the difference: about 1,486 bb over the 100 deal pairs (23 of 30 river spots), against a measured gap to TAG of 1,327 bb. For example, 2♠K♥ made the nuts on the river and Haiku bet 60 chips, 1.5 pot, where TAG's line is all-in. The brief shows the station's record ("fold to a bet 0% (n 46)"), but the menu prices every size only as a bluff; in one river spot it chose a pot bet over "all-in 1,880 · 94.0 bb · 7.8× the pot · bluff needs 89% folds". A value line for each size (how often a caller calls) is the first thing to try in prompt v1.

Equities are against the engine's modelled range, not the station's actual cards, and the rule bots' own lines on these deals weren't traced, so the 1,486 bb is an estimate of the cause, not an accounting of the gap.

### Claude Sonnet on the same deals (2026-10-14)

`claude-sonnet-5-5`, same settings and prompt (sha256 `f5a054b3…`), run `20261014075701-7fd4` with `--same-deals-as 20261014054614-d528`, so every deal pairs with Haiku's (the rule-bot rows came out identical, which confirms it).

| A vs B | bb/100 | A − TAG, same deals | A − Fish, same deals |
|---|---|---|---|
| sonnet vs station | +1623 ± 399 | −121 ± 363 | +1189 ± 428 |
| sonnet vs tag | 0 ± 223 | −75 ± 186 | −121 ± 288 |

| Sonnet − Haiku, same deals | bb/100 |
|---|---|
| vs station | +542 ± 376 |
| vs tag | −134 ± 203 |

- **Mechanics:** 1,294 decisions, 1,294 calls, no fallbacks. Wall time p50 3.9-4.5 s, p95 about 13 s, max 33 s. At effort low Sonnet hardly thinks (18-56 thinking tokens per decision, against Haiku's 290-430), so the comparison is of the two models as the CLI runs them at that setting, not at equal thinking.
- **Against the station** Sonnet wins about as much as TAG and clearly more than Haiku. It fixes about half of Haiku's sizing leak: with equity of 80% or more where the TAG advice was all-in, it moved in 19 of 49 times (Haiku 8 of 47), 18 of 34 on the river (Haiku 7 of 30), leaving about 953 bb on the river by the same estimate (Haiku about 1,486). It also stopped the thin bets: at 35-50% equity it bet 7 of 111 times (Haiku 38 of 98).
- **Against TAG** neither model separates from the rule bots or from each other. Sonnet's main departures from the advice are preflop calls where TAG folds or raises (16 of 28 "off" verdicts), and it folds to a bet more than TAG does (53% against 42.5%). No price blunders in 169 decisions facing a bet.

## Prompt v1.1: pre-registered plan (2026-10-14)

Prompt v1.1 (`llm-bots.md`, "Opponent ledger and prompt v1.1") adds engine-computed numbers to the brief: per-size fold estimates, the river's expected gain over checking, the stack-off size and deterministic reads from a per-match opponent ledger, plus rules for using them and an eval-only persona, the Exploiter. This section fixes how it will be judged before any model has seen it. Nothing below has been run against a model; the first live call waits for the user to pick a budget tier.

### What the diagnosis predicts

| Where | v0 (Haiku / Sonnet, 100 deals vs the station) | What v1.1 should change |
|---|---|---|
| River, nothing to call, equity 80% or more: all-in | 10 of 52 / 25 of 54 | Most of them all-in |
| Value left against an all-in on the river (model estimate, exact only against a never-folder) | about 3,620 bb / 2,570 bb per 100 deal pairs | Down by most of it |
| Flop and turn, equity 62% or more: a pot or more | 21 of 138 (Haiku, flop and turn) | More, toward the stack-off size |
| After the flop, equity under 35%, nothing to call: bet | 2 of 200 against the station, 4 of 70 against TAG | Up against folders only |

Measured variance (sd per paired deal, 95% CI at 100 deals): Haiku − TAG vs the station 40.4 / ±396; Sonnet − Haiku vs the station 38.1 / ±374; Haiku − TAG vs TAG 18.5 / ±182; Sonnet − Haiku vs TAG 20.6 / ±202.

Expected, and labelled as expectations: v1.1 − v0 against the station about +600 to +1,200 bb/100 (detectable at 100 deals; plan ±420, since v1.1 shoves more); against TAG about 0 (100 deals only rule out a loss beyond about 200); against a folder about +50 to +150 (not detectable; the decision metrics lead).

### Stages

| Stage | Content | Calls | Wall time (3 in flight) |
|---|---|---|---|
| A, offline | The replay gate on both finished runs (all 2,565 decisions' v0 user messages byte-identical); CPU runs of TAG against `folder` and `calldown` (their fold to a bet, the sd per pair, a TAG baseline); fold-model calibration; the false-read rate of TAG against TAG | 0 | CPU |
| B, spot replay | Haiku v1.1 on the v0 trajectories: river value against the station 96, flop and turn value 60, weak hands against TAG 70, facing bets against TAG 40, simulated folder spots 120 (v0 too), v0 asked again on 50 spots | about 560 | about 15 min |
| C, paired full | Haiku v1.1 against the station and TAG on `--same-deals-as 20261014054614-d528` (4 × 25, paired with v0 and the rule baselines); Haiku v0 and v1.1 against the folder (2 × 50, new seed, snapshot on) | about 1,280 + 1,000 | about 65 min |
| D, held out | After freezing v1.1 (digest committed), a new secret seed: Haiku v0 and v1.1 against `calldown` and `size-reader` (2 × 50); `lag` optional | about 2,300 (+1,100) | 65-95 min |
| E, model | Sonnet v1.1 against the station and TAG on the same deals, paired with `7fd4` | about 1,300 | 40-50 min |
| M, memory ablation | M0 aggregate statistics only; M1 = M0 + size buckets, showdown rate and reads; M2 = M1 + the showdown log; against `size-reader` and `folder`, 2 × 50, snapshot on; M0 against M1 first | about 2,000 | about 55 min |

Budget tiers: minimal (B and C against the station and TAG) about 1,840 calls; standard (B and C) about 2,840; full (B to M) about 9,000. Haiku first; Sonnet only after C passes. Also in B: v1.1 without the EV lines (about 100 calls), to measure how much of the effect is the model following the highest gain.

### Pre-registered gates

- **B → C:**
  - river, nothing to call, equity 80% or more, against the station: all-in at least 60% (v0 Haiku 10 of 52);
  - the river's highest-gain option taken at least 70% of the time (EV-argmax agreement);
  - no price blunders, and no river bet with equity under 50% against the station;
  - weak-hand bet rate against TAG at most v0's plus 10 points;
  - folder spots: bluff at least 50% of weak-hand spots where the best size clears its price by 10 points, and at most 15% where it does not;
  - choice validity at least 98%.
- **C success:** against the station, v1.1 − v0 has a 95% CI that excludes 0; against TAG the point estimate is at least −100; price blunders at most v0's; fallbacks at most 2%. The folder's bb/100 is reported without a gate.
- **Stop rules unchanged:** auth, usage or 429 errors, model drift, tool calls, fallbacks over 2%, the call cap, the pilot pause.
- **Calibration and false reads (stage A):**
  - *Calibration, as restated (see below):* predicted − realised within 10 points in every size bucket with at least 30 bets, counting only bets made after the opponent has faced 15 bets, and the over-pot bucket only once it holds 5 bets. The original wording was "within 10 points in every size bucket with at least 30 bets", pooled over every bet of a match. **The gate was restated on 2026-10-14, after stage A and before any live call, because the pooled version includes the first bets of every match, which are estimated from the typical-player prior by design.** The original (pooled) numbers are kept in the Stage A tables.
  - *False reads:* reads shown in under 2% of the decisions of TAG against TAG. The first thresholds failed it (3.65%); v1.1 changes the two reads that fired and passes it (1.08%).
  - A failure is reported with its numbers; thresholds are not retuned to pass a gate except by a new version before any live call, as v1.1 was.

### Guarding against overfitting

- The development set is the station, TAG and the folder only. The held-out opponents and their seed are used once.
- v1.1's text and thresholds are frozen with a committed digest (`prompt.test.ts`); any change is v2 with a new seed.
- Reads are a generic vocabulary; no probe's name appears in a prompt.
- Rule-bot same-deal baselines on the held-out opponents are reported.
- All results are reported, including losses.
- Risks and how they are caught: over-general value betting (all-ins against TAG with a calling hand under 55%, stage B counts them), a miscalibrated fold model (stage A), false reads at small n (stage A and the TAG bluff rate in B), the model reducing to the highest-gain option (agreement rate and the no-EV ablation), a leak between the halves of a deal (the snapshot tests with a positive control), broken pairing (the byte-identical replay gate and the pinned digests), token and latency growth (percentiles in the report).

### Stage A results (2026-10-14, CPU only, no model)

**Replay gate.** `pnpm eval:llm-hu-replay 20261014054614-d528 20261014075701-7fd4`: 200 pairs and 1,271 decisions (Haiku), 200 pairs and 1,294 (Sonnet), **2,565 of 2,565 user messages byte-identical**, 0 game-state problems, about 35 s each; the same on the commit that adds prompt v1.1. A test has a positive control (one changed character in a recorded message is the only difference found).

**Probes and the TAG baseline.** `pnpm eval:exploit-calibration`: TAG against each opponent, 60 matches of 50 deals (3,000 deals, 6,000 hands), seed 20261014, snapshot mode (as a v1.1 run keeps its ledger).

| TAG vs | Opponent fold to a bet | TAG bb/100 | sd per deal pair | Expected fold to a bet |
|---|---|---|---|---|
| `folder` | 72.5% (779 of 1,075) | −13 ± 34 | 18.9 bb | 55-70% |
| `calldown` | 35.5% (599 of 1,689) | −4 ± 33 | 18.3 bb | 25-35% |
| TAG | 49.7% (674 of 1,357) | −22 ± 35 | 19.7 bb | |
| `station` | 0% (0 of 7,516) | +1,552 ± 82 | 45.6 bb | 0% |

Both probes fold a little more than the design guessed. TAG alone does not exploit the folder or the calldown (its result is within noise of 0), so there is room for an exploiting player to win; the sd per pair is about 18-20 bb for these and 46 bb against the station, so 100 deals give ±180 and ±450.

**Fold-model calibration.** The estimate for each bet's size, from the probe's record before the bet, against whether the probe folded. Gap is estimate minus realised, in points; the pre-registered gate is 10 points in every size bucket with 30 or more bets.

| Opponent | Under ½ pot | ½-¾ pot | About pot | Over pot |
|---|---|---|---|---|
| `folder` | 336 bets: 49% vs 74%, **−24.4 FAIL** | 732: 62% vs 73%, **−10.3 FAIL** | 3 bets | 4 bets |
| `calldown` | 577: 30% vs 31%, −0.7 | 1,098: 40% vs 38%, +1.7 | 2 | 12 (68% vs 25%) |
| TAG | 468: 33% vs 37%, −4.0 | 879: 52% vs 56%, −4.2 | 3 | 7 |
| `station` | 1,043: 4.6% vs 0%, +4.6 | 1,946: 6.8% vs 0%, +6.8 | 3,572: 3.1% vs 0%, +3.1 | 955: 19.6% vs 0%, **+19.6 FAIL** |

Only the folder's two small buckets and the station's over-pot bucket fail. By how many bets the probe had faced, the folder's estimates are 48% (0-4 bets; realised 71%), 62% (5-14; 74%) and 64% (15-29; 72%); only bets after 15 faced: −18.1 points under ½ pot (68 bets, still FAIL), −3.8 for ½-¾. The station's over-pot estimate falls from 28% (0-4 faced) to 3% (30 or more), and stays at 18.7% on the bets after 15 faced because the over-pot bucket fills slowly.

*Why.* The estimate starts at the rational defender and moves by a log-odds shift fitted to the probe's overall fold rate, so (1) a flat folder (74% at every size) is under-read at small sizes, where a rational defender folds only 25%, and (2) the prior is worth 12 bets at 40%, which a 50-hand match (about 18 bets faced by the folder, 125 by the station) never overcomes. The over-pot bucket is the design's "conservative, converges as the bucket fills".

*Alternatives tried, offline.* I tried alternatives on the same bets, offline. Smaller priors fix the folder's gap but trade it for noise-chasing:

| Variant | folder gaps (pooled) | calldown gaps | Brier folder / calldown / TAG |
|---|---|---|---|
| as built (prior 12, bucket 4) | −24.4, −10.3 | −0.7, +1.7 | .2559 / .2518 / .2613 |
| prior 3, bucket 1 | −10.8, −2.8 | +2.8, +2.4 | .2569 / .2724 / not run |
| prior 2, bucket 1 | −9.3, −2.1 | +3.1, +2.5 | .2571 / .2744 / not run |
| half the model flat in size (prior 12, bucket 4) | −19.4, −10.4 | +3.0, +1.4 | .2454 / .2505 / .2608 |
| half flat, prior 6, bucket 2 | −13.0, −5.9 | +3.9, +1.8 | .2457 / .2607 / .2709 |

(Brier is the mean squared error of the estimate over every bet faced.) No variant that is not over-fitted passes the pooled gate, because the first five bets of every match are estimated before there is evidence. **Decision (main session, before any live call): the fold model stays as built, and the gate is restated** as what the model claims: within 10 points in every size bucket with 30 or more bets **made after the probe had faced 15 bets**, with the over-pot bucket counted only once it holds 5 bets (the cap already in the model). Results on the restated gate (same seed, same decisions; the model is unchanged, so the pooled numbers above are unchanged too):

| Restated gate | Under ½ pot | ½-¾ pot | About pot | Over pot |
|---|---|---|---|---|
| `folder` | 68 bets: 58% vs 77%, **−18.1 FAIL** | 140: 67% vs 71%, −3.8 | 0 | 0 |
| `calldown` | 276: 30% vs 32%, −1.5 | 478: 37% vs 40%, −3.1 | 2 | 0 |
| TAG | 158: 36% vs 40%, −3.7 | 269: 55% vs 57%, −1.4 | 1 | 0 |
| `station` | 722: 1.1% vs 0%, +1.1 | 1,336: 1.4% vs 0%, +1.4 | 3,540: 2.9% vs 0%, +2.9 | 653: 10.4% vs 0%, **+10.4 FAIL** |

So two misses remain: the folder under ½ pot (about −18) and the station over pot (about +10, from +19 pooled). Both err in the conservative direction: against an over-folder the model under-estimates folds, so v1.1 bluffs less than it could (the cost is a missed gain, not a loss); against a station on over-pot sizes it over-estimates folds, which lowers the *shown* value of the biggest bets, and bluffs at those sizes are already held to the rational defender's rate by the extrapolation cap. They are accepted, documented limits of the model, to be revisited as a v2 candidate (a half-flat model improves the Brier score on all three probes but leaves about −15 on the folder's small sizes). The effect on play: the model under-estimates a folder's folds at small sizes, so v1.1 will under-bluff small against a folder (it prices them at 49% where the player folds 74%), and the larger sizes read as better value (example (b): +3.7 bb at ⅓ pot against +4.5 at pot).

**False reads, with the reads as first written (v1, never run against a model).** Reads shown to either player in TAG against TAG, 21,483 decisions (60 matches of 50 deals): **784 (3.65%), above the 2% gate (FAIL).** "folds a lot" 430 (2.00%), "calls down light" 342 (1.59%), "rarely bets" 12 (0.06%). TAG's true fold to a bet is 49.7%, so "folds a lot" (lower bound above 50%) fires on noise around a coin flip, and "calls down light" fires because TAG calls the river with one pair (the event counts a pair as light). Against the other opponents the same reads are mostly true: the folder is read as "folds a lot" in 28% of TAG's decisions (and TAG as "folds a lot" in 3.3% of the folder's); the calldown as "rarely bets" in 35% of all decisions; the station as "calls a lot" in 39% (59.5% of all decisions carry some read).

*Candidates, tested offline on the same decisions (false rate in TAG against TAG; share of TAG's decisions that read the folder as "folds a lot")*:

| Read variant | TAG v TAG | Recall vs folder |
|---|---|---|
| v1 as first written: lower 80% bound > 0.50 | 2.00% | 27.9% |
| lower 90% bound > 0.50 | 1.03% | 15.1% |
| lower 80% bound > 0.55 | 0.73% | 13.6% |
| lower 90% bound > 0.55 | 0.27% | 5.8% |
| calls down light: pair or worse, 2 showdowns (v1 as first written) | 1.59% | |
| pair or worse, 3 showdowns | 0.00% | |
| no pair at all, 2 showdowns | 0.00% | |

**Decision (main session, before any live call): adopt the smallest tested change as prompt version v1.1** (v1 was never exposed to a model, so v1.1 replaces it; row ids and docs say `v1.1`): "calls down light" counts only river calls with no pair at all, and "folds a lot" uses a 90% bound. The digest changed (`5c2370ea…`) and now also hashes the read thresholds (`READ_RULES`). Re-run on the same Stage A seed and decisions (`pnpm eval:exploit-calibration`):

| TAG vs | Decisions of either player | Reads shown | By label | TAG reading the probe | The probe reading TAG |
|---|---|---|---|---|---|
| TAG (the gate) | 21,483 | **233 (1.08%), PASS (gate 2%)** | folds a lot 221, rarely bets 12 | 101 (0.94%) | 132 (1.23%) |
| `folder` | 20,368 | 1,683 (8.26%) | folds a lot 1,673, rarely bets 10 | 1,552 of 10,193 (**15.2%**, was 27.9%) | 131 (1.29%, all "folds a lot") |
| `calldown` | 22,389 | 8,276 (36.96%) | rarely bets 7,784, bets a lot 485, folds a lot 7 | 7,791 of 10,689 (72.9%, "rarely bets") | 485 (4.15%, "bets a lot") |
| `station` | 46,410 | 27,468 (59.19%) | calls down light 18,133, rarely bets 19,468, calls a lot 18,279, bets a lot 7,844 | 19,624 of 21,183 (92.6%) | 7,844 (31.1%, "bets a lot") |

Against TAG the only reads left are noise around a coin flip (1.1%, within the gate) and "rarely bets" 12 times (0.06%). The reads that are true stay: the folder is read as folding in 15% of TAG's decisions (the match is short, so most of the early decisions have no read), the station as a caller on 92.6% of TAG's decisions, and "calls down light" still fires against the station (18,133 decisions), which calls the river with nothing. Calibration is unchanged (the model did not change) and the replay gate is unaffected (v0 only).

### Commands

```bash
cd apps/server
# Stage A (CPU only)
pnpm eval:llm-hu-replay 20261014054614-d528 20261014075701-7fd4
pnpm eval:exploit-calibration --opponents folder,calldown,tag --json .eval/stage-a/all.json
# Stage B (live; waits for the user's budget tier): build spot files, then ask the model
pnpm eval:llm-hu-spots --run 20261014054614-d528 --select river-value=96,flop-turn-value=60,weak-vs-tag=70,facing-vs-tag=40,any=50 --out .eval/spots-v0.json
pnpm eval:llm-hu-spots --sim tag,folder --sim-seed 20261014 --matches 4 --deals-per-match 25 --select postflop-unbet=80,postflop-facing=40 --out .eval/spots-folder.json
pnpm eval:llm-hu --spots .eval/spots-v0.json --models claude-haiku-5-5 --prompts v0,v1.1
# Stage C
pnpm eval:llm-hu --models claude-haiku-5-5 --prompts v1.1 --snapshot-per-pair --same-deals-as 20261014054614-d528 --opponents station,tag
pnpm eval:llm-hu --models claude-haiku-5-5 --prompts v0,v1.1 --snapshot-per-pair --opponents folder --baselines tag --matches 2 --deals-per-match 50
pnpm eval:llm-hu-compare 20261014054614-d528:cli <v1.1 run id>:cli
```
