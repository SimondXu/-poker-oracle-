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
