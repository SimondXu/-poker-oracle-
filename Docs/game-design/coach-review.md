# Coach hand review

Status: approved (2026-10-12), implemented on `feat/coach-hand-review`; where the code departs from the first draft, this text was updated to match. Builds on `Docs/game-design/coach-advice.md` (the `CoachAdvice` contract, merged in PR #3 and #4).

## Summary

After each hand, the hero sees each of their decisions next to what the TAG policy would have done, with a verdict per decision (matched, close or off), and a running tally for the session. The server records the advice it already builds for every human decision, joins it to the action the hero took, grades it, and sends the hero their own review at the end of the hand. The same records become the eval samples for phase 2 (LLM commentary).

## Problem

- The coach teaches at the decision point only. Once the hero acts, the advice disappears, and nothing tells them afterwards whether their play matched the policy or why not.
- Learners who turn the hints off to test themselves get no feedback at all.
- Phase 2 needs stored `{advice, heroAction}` pairs to ground and evaluate commentary. Nothing records them today.

## Goals

1. **Graded decisions.** Every hero decision in a hand gets: street, the hero's action, the policy's options and frequencies, and a verdict. The verdict is computed by one pure function from the advice and the action.
2. **Server-side records.** The records live on the server, so they survive a reload, work with the coach turned off, and are ready for phase 2.
3. **Review at hand end.** The review appears without a modal and without blocking the next hand (PRODUCT principles 4 and 5).
4. **A real session tally.** Matched, close and off counts over the session, from the records only, so nothing is fabricated.

## Non-goals

- LLM commentary (phase 2).
- Persistence across server restarts, or accounts (PRODUCT: no persistence).
- EV or chip-loss estimates per decision. The policy gives frequencies, not values, and estimating EV would need a solver we don't have.
- Reviewing bots' decisions.

## Design

### Verdict

Shared pure function in `packages/shared`:

```ts
export type CoachVerdict = 'matched' | 'close' | 'off';
export function gradeDecision(advice: CoachAdvice, hero: { kind: CoachActionKind; to?: number }): CoachVerdict;
```

- **matched:** the policy plays the hero's kind at least 25% of the time. For bet and raise, only the policy's sizes whose total (`to`) is within ±50% of the hero's count toward that 25%; two sizes of the same kind add up.
- **close:** the hero's kind is an option, but the policy plays it less than 25% of the time, or at another size.
- **off:** the hero's kind is not among the options, and the advice is stable. Options under 0.5% are already dropped by the contract.
- **Unstable advice is never off.** When the advice is `stable: false`, an action outside its options is close: the options could change within the equity error. (The first draft said "close when the hero took the second-most-frequent option", but any option already grades close or better, so that rule did nothing.)
- **Sizes compare totals.** The advice does not carry the hero's street commitment, so the ±50% is of the policy's total, not the chips it adds. They differ only when the hero already has chips in on the street (blinds, a re-raise).
- The hero's kind comes from `classifyAction`, the same function the contract uses for options, so an all-in that only calls is graded as a call.

The thresholds (25%, ±50%) are constants and an open question below.

### Recording (server)

`RuntimeRoom` gets, by human player id:

```ts
coachAdvice: Map<string, CoachAdvice>;            // the open decision's advice; its stateVersion says which
coachRecords: Map<string, CoachReviewDecision[]>; // this hand
coachSessions: Map<string, CoachSessionTally>;    // { matched, close, off }
coachReviews: Map<string, GameReviewEvent>;       // the last review sent, replayed on reconnect
```

A record is the contract's `CoachReviewDecision` (street, advice, hero action, verdict). The code is in `apps/server/src/game-loop/coach-review.ts` (`recordCoachDecision`, `takeHandReviews`) and `ws/view-models/hero-coach.ts` (`openDecisionAdvice`).

1. **When advice is built** (`buildHeroCoachEvent`), the advice is kept on the room as the open decision's advice, keyed by player and checked by `stateVersion`. A reconnect during the decision reuses it instead of rebuilding.
2. **When the actor's action is applied:**
   - Applied paths: the player's own action at `ws/handlers/game-events.ts:581`, and the timeout at `:308`.
   - The server classifies the action from the pre-action state and grades it against the kept advice.
   - If the advice was not built yet (the hero acted within the same tick), the server builds it there and then. It is deterministic by seed, so it matches what would have been sent.
   - The server then appends the record.
3. **At hand end**, next to `recordFinishedHandStats`, each human's records go out as one `game:review` event to that player's sockets only:
   - the decisions;
   - the updated session tally;
   - the hand number.

   Then this hand's records and kept advice are cleared. No other player or spectator receives anyone's review. A human with no decision in the hand gets no review.
4. **On reconnect during `hand_end`**, the socket gets the last review again, as it already gets `game:hand_result`.

Timeouts are graded like any action, but flagged `source: 'timeout'` so the review can say so.

### Contract (`packages/shared`)

```ts
export interface GameReviewEvent {
  roomId: string;
  playerId: string;
  handNumber: number;
  decisions: CoachReviewDecision[];
  session: CoachSessionTally;
}

export interface CoachReviewDecision { street: BotDecisionPhase; advice: CoachAdvice; heroAction: CoachHeroAction; verdict: CoachVerdict }
export interface CoachHeroAction { kind: CoachActionKind; to?: number; source: 'player' | 'timeout' }
export type CoachSessionTally = Record<CoachVerdict, number>;
```

### Web

- The store keeps the latest review: a newer hand's replaces it, a replay of the same hand is taken, an older hand's is ignored. It is not cleared when the next hand starts, only when the hero leaves the table.
- **Coach tab when the hand is over:** the hero summary it shows today, then a "This hand" list with one row per decision:
  - street;
  - "You: Call 40";
  - "TAG: Raise to 120 70% · Call 30%";
  - the verdict as text, coloured with existing tokens only: positive for matched, caution for close, the text colour for off. No new hues.
- **Expanding a row** shows the advice's reasons, through the existing i18n: each option's own reasons under its name, then the reasons all options share.
- **Session tally:** one line under the list, for example "Session: 14 matched, 5 close, 2 off".
- **Off-turn during the next hand:** the last hand's review stays under the position line until the hero's first decision of the new hand, then gives way to the live coach. So it never competes with a decision.
- The coach toggle hides the review too. The server records either way, so turning the coach back on shows the tally.

## Implementation plan

1. `gradeDecision` and the event types in shared, with tests over verdict edge cases: thresholds, sizes, an all-in that calls, unstable advice, a timeout.
2. Server: records, the hooks in the action and timeout paths, the hand-end emit, the reconnect replay.
3. Web: store, Coach tab review list, session line, en/zh copy.
4. Browser check on the review servers.

## Validation

- **Unit:** `gradeDecision` table tests.
- **Server:**
  - every human decision in a seeded hand gets exactly one record;
  - a fast action (before advice was emitted) still gets the same advice;
  - a timeout is recorded with `source: 'timeout'`;
  - `game:review` reaches only the player's own sockets;
  - the session tally adds up across hands;
  - a reconnect at hand end gets the review.
- **Web:** store tests for keeping and replacing reviews; a reasons-render test in both locales.
- **Browser** (en and zh, 1440 and 375 wide):
  - a played hand shows its decisions and verdicts;
  - the review stays visible off-turn and gives way at the hero's first decision;
  - coach off hides it.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Risks

- **Grading is only as good as the policy.** A "matched" against a flawed policy teaches the flaw. For example, the big-blind defense was too tight until PR #4. The copy says "TAG policy", not "correct", and the session line is a tally, not a score.
- **Noise.** Unstable advice can flip, so grading a deviation from unstable advice as "off" would be unfair. It is graded close instead.
- **Memory.** Records for the current hand only, plus three counters per player. No growth.

## Decisions (2026-10-12)

The user approved the three recommendations:

1. **Matched threshold:** an option the policy plays at least 25% of the time counts as matched.
2. **Placement:** the review lives in the Coach tab only; nothing is added to the Log tab.
3. **Session tally:** shown.
