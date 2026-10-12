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

| A vs B | Baseline (equity vs random) | Range equity |
|---|---|---|
| tag vs tag-random | n/a | +78 ± 51 |
| tag vs station | +1132 ± 70 | +1516 ± 81 |
| tag vs overbettor | +337 ± 111 | +153 ± 103 |
| tag vs fish | +30 ± 63 | −5 ± 47 |
| lag vs tag | −138 ± 73 | −82 ± 54 |
| tag vs maniac-shove | +206 ± 127 | +206 ± 127 |

Baseline is commit `b1df0c1`. Range equity: postflop equity is computed against each opponent's likely hands (preflop range from the TAG baseline mixes for their action, narrowed street by street by bet size, with a balanced bluff share of s/(1+2s) of each bet).

## Reading the numbers

- Range equity beats the old TAG head to head (+78 ± 51) and extracts much more from a calling station. It stops calling down with bottom pair against three streets of betting.
- It does worse against `overbettor`: the range model assumes every bettor plays like a TAG, so a player who bets 1.5x pot with any two cards gets credited with a strong range and is folded to too often. Fixing that is the job of opponent modelling (adjusting each player's range from what they have shown), which is the next step.
- `tag` vs `fish` is within noise in both versions: the fish bot plays too much like the TAG bot to separate them.
