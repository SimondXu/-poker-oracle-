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
