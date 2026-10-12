# Bot evaluation

How we tell whether a strategy change made the bots stronger, and the numbers so far.

## Method

Duplicate heads-up (`apps/server/src/tools/duplicate-hu.ts`): each deal is played twice on the same deck with the seats swapped, and A's result is the sum of both halves. That cancels most card luck. We report A's win rate in bb/100 hands with a 95% confidence interval (1.96 · sd / √n over deal pairs). 100bb stacks, blinds 10/20.

Policies: the rule bots `fish`, `tag`, `lag`; `tag-random` (TAG with equity against random hands, the pre-range baseline); and three probe opponents that exist only in the harness: `station` (never folds, never raises), `maniac-shove` (all-in every decision), `overbettor` (bets or raises 1.5x pot with any hand).

```bash
cd apps/server
pnpm simulate:bots --mode duplicate-hu --a tag --b station --hands 3000 --seed 20261011 --json
```

`--hands` counts deals, so 3000 deals is 6000 hands. A run with rule bots takes about 2 to 4 minutes (Monte Carlo equity); probe-only matchups are faster.

## Results (seed 20261011, 3000 deals each)

| A vs B | Baseline `b1df0c1` | Range equity `c98bb70` | + Price check, opponent model |
|---|---|---|---|
| tag vs tag-random | n/a | +78 ± 51 | +120 ± 45 |
| tag vs station | +1132 ± 70 | +1516 ± 81 | +1698 ± 85 |
| tag vs overbettor | +337 ± 111 | +153 ± 103 | +404 ± 110 |
| tag vs maniac-shove | +206 ± 127 | +206 ± 127 | +588 ± 119 |
| lag vs tag | −138 ± 73 | −82 ± 54 | −39 ± 45 |
| tag vs fish | +30 ± 63 | −5 ± 47 | +1 ± 38 |
| fish vs station | n/a | +1606 ± 82 | +568 ± 56 |

- **Baseline**: equity against random hands.
- **Range equity**: postflop equity against each opponent's likely hands (preflop range from the TAG baseline mixes for their action, narrowed street by street by bet size, with a balanced bluff share of s/(1+2s) of each bet).
- **Price check, opponent model**: preflop calls (and calls for all the chips) are checked against equity versus the raiser's range, with raises far over a standard size read as a narrower range; position comes from who acts last after the flop; a deep near-lock bets instead of shoving. Each player's tendencies (VPIP, raise and shove rates, postflop aggression, fold to a bet) are counted hand by hand and smoothed with a Beta prior worth a dozen TAG-like hands; a player shown to be more aggressive or stickier than that gets a wider range, and a player who almost never folds gets no bluffs and bigger value bets. Fish ignores opponents' history on purpose.

## Reading the numbers

- TAG now wins more than the baseline did against every probe opponent, beyond the confidence intervals, and beats its pre-range self by +120 ± 45. Against Fish it is unchanged within noise.
- The preflop price check alone (before the opponent model) made the bots fold to a player who shoves every hand: TAG vs `maniac-shove` fell to −23 ± 45. A real player could exploit that by shoving every hand, so the price check only ships together with the opponent model, which reads a habitual shover's range as any two cards.
- Fish against a calling station dropped from +1606 to +568 because Fish doesn't adapt: it keeps bluffing the station and doesn't size up its value bets. That is the intended difference between Fish and the adaptive personalities.
- `tag` vs `fish` stays within noise. Their preflop ranges are too similar to separate them in heads-up play.
