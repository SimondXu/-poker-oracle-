# Coach commentary (phase 2) and the LLM provider layer

Status: proposed (2026-10-12), awaiting approval. Builds on `coach-advice.md` (the `CoachAdvice` contract) and `coach-review.md` (the graded hand review, PR #5). The provider layer specified here is shared with the LLM bots (`llm-bots.md`).

## Summary

When the hero opens a review row, the server asks an LLM to explain that one decision in two sentences and a takeaway, in the hero's language. The model never writes a number or a card: it writes fact keys such as `{equity}`, and the server fills them in with the same formatters the review row uses, so the commentary cannot disagree with the row. A deterministic validator checks every output before it is served; a failure gets one repair attempt, and otherwise the hero sees no commentary, only the reasons that are already there.

The commentary ships only if an offline eval shows it beats a templated sentence built from the same facts, while passing every hard check. LLM calls go through one thin OpenAI-compatible provider layer, configured per server, that works with OpenAI, OpenRouter, third-party relays, and Anthropic (through OpenRouter or its compatibility endpoint in v1).

## Problem

- The review explains with fixed sentences, one per reason code (`coach-model.ts`, `REASON_TEXT`). Nothing ties the hero's action, the policy's mix and the reasons into one explanation, or says what to take away.
- The records the review produces (`CoachReviewDecision`) are self-contained eval samples, but no dataset or eval harness for text output exists.
- The existing LLM plumbing serves only the LLM bots and is OpenRouter-only: model ids are hard-coded in `packages/agent-engine/src/openrouter-client.ts`, and the room spend cap counts an unreported cost as zero (`llm-agent-runtime.ts`, `response.costUsd ?? 0`), so a provider that doesn't report cost is never capped.
- `.env*` files are not git-ignored (`git check-ignore` matches none of `.env`, `apps/server/.env`, `apps/web/.env.local`). None is tracked today, but configuring provider keys would put one a `git add -A` away from a commit.

## Goals

1. **Grounded.** Every number and card in served text comes from the record by construction; the cited reason codes exist in the record; the stated verdict equals `gradeDecision`'s.
2. **Measured.** A versioned golden set, deterministic metrics, a calibrated LLM judge with human spot checks, providers and models compared side by side, and CI that runs offline from recorded responses.
3. **Several providers, chosen by server configuration:** OpenAI, OpenRouter, any OpenAI-compatible relay, and Anthropic. Keys and base URLs stay in the server's environment.
4. **Fits PRODUCT.md.** On demand, never pushed; never blocks a decision; en and zh; off without errors when no provider is configured.

## Non-goals

- Commentary on bots' decisions, a narrative per hand, follow-up questions (open question 4).
- EV estimates or claims about correct play (as in `coach-review.md`).
- Persistence or accounts in the product (an optional dev-only dump is open question 6).
- A native Anthropic adapter, streaming, tool calling (later, if needed; see the provider layer).

## Design

### Product

| Option | Cost | Felt latency | Nagging |
|---|---|---|---|
| **A. On expand, one decision (chosen)** | Only rows the hero opens | 1.5-4 s after opening (estimate); the reasons show at once | None: the hero asks |
| B. A paragraph per hand, pushed at hand end | Every hand with a decision | None | Text every hand while the next deals |
| C. Prefetch close and off rows, show on expand | 30-40% of decisions (estimate) | About none | Low |

- **What it says:** at most two sentences on what the hero did against what the policy does and why, tied to the cited reasons, then at most one sentence to take away. "The policy raises here because…", never "you must…". When the verdict is close because the advice is unstable, it says the spot is close.
- **Where:** plain text under the reasons in the expanded row, with a quiet "Writing an explanation…" line while waiting (the `thinking-dot` animation, with its reduced-motion variant). Nothing modal; nothing above the hero's focus moves. The coach toggle hides it with the review.
- **Language:** generated in the locale the client sends; not translated afterwards, which would double latency and cost and can change numbers. Cached per hand, decision and locale.
- Switch to C only if the measured p95 on expand is over 4 s and the wait proves annoying in use.

### Contract (`packages/shared`, additive)

```ts
export const COACH_COMMENTARY_VERSION = '2026-10-xx.1'; // prompt + fact sheet + validator; bump on any change
export type CoachLocale = 'en' | 'zh';

/** A public action before the hero's decision, by position: never a name or id. */
export interface CoachLineAction { street: BotDecisionPhase; position: BotPosition; isHero: boolean; kind: CoachActionKind; to?: number }
// The server's record, CoachReviewRecord (CoachReviewDecision plus `line: CoachLineAction[]`), captures the line
// from the pre-action hand. game:review sends each decision without it (open question 7; server-only for now).
// GameReviewEvent gains `commentary: boolean`: whether explain requests are served for this review.

// client -> server 'coach:explain', answered by ack (as other requests are, ws/ack.ts)
export interface CoachExplainRequest { roomId: string; handNumber: number; actionIndex: number; locale: CoachLocale }
export type CoachExplainAck =
  | { ok: true; commentary: CoachCommentary }
  | { ok: false; error: 'unavailable' | 'not_found' | 'rate_limited' | 'budget' | 'failed' };

export interface CoachCommentary {
  handNumber: number;
  actionIndex: number;
  locale: CoachLocale;
  summary: string;          // rendered: the server has replaced the fact keys
  takeaway: string | null;
  cites: CoachReason['code'][];
  version: { commentary: string; policy: string; model: string }; // model: the profile's label only
}
```

- **Lookup:** the server finds the decision in `room.coachReviews` by hand number and `advice.actionIndex`. That review is this hand's or the last one's, exactly what the client can show, so nothing new is stored. Answers are cached per player and cleared when the review is replaced.
- **No LLM call inside the room task queue.** The handler copies the immutable record and awaits the provider outside it, as `Docs/plans/agent-engine/decisions.md` §3 already requires.
- **Client:** `gameStore.commentary` keyed `${handNumber}:${actionIndex}:${locale}`. A late answer for a review no longer shown is stored and not rendered. The record is immutable, so no `stateVersion` check is needed.
- **Why `line` joins the shared record:** without the betting line the model guesses it; with it the eval sample is self-contained. It is public and costs a few dozen bytes per decision (open question 7: send it to the client, or keep it server-only).

### Provider layer (`apps/server/src/llm/`, shared with the bots)

**Choice: a thin OpenAI-compatible Chat Completions adapter over `fetch`, with a checked-in profile table.** The repo already hand-rolls its OpenRouter client; a library (for example the Vercel AI SDK) would still leave cost, budget, circuit breaking and recorded responses to us, and its relay support is unverified. A native adapter can be added later behind the same interface.

- **Common denominator:** non-streaming Chat Completions returning one JSON object, no tools. Commentary needs none, the bots make one structured call, and forced tool calls are not portable (Anthropic's compatibility layer rejects `tool_choice: "required"` for some models).
- **Structured output, by declared capability:**
  - `json_schema`: OpenAI strict mode; OpenRouter with `provider.require_parameters: true` (without it `response_format` is only a preference).
  - `json_object`: JSON mode (OpenAI requires the word "JSON" in the prompt).
  - `prompt`: the schema in the prompt; the parser strips code fences and takes the first top-level object. For relays and Anthropic's compatibility endpoint, which ignores `response_format` and `strict`.
  - Every mode ends in the same zod validation and the caller's semantic validator, with at most one repair call that sends the errors back.
  - Schemas are written to the strict intersection (every property required, optional ones nullable, `additionalProperties: false`, no length keywords; lengths are checked in zod) and kept static, since providers compile and cache grammars per schema.
- **Profiles** (`llm/profiles.ts`, checked in; secrets only by env-var name):

  ```ts
  interface LlmProfile {
    id: string;
    label: string;                  // the only part a client ever sees
    baseUrlEnv: string;
    apiKeyEnv: string;
    model: string;
    structured: 'json_schema' | 'json_object' | 'prompt';
    sendTemperature: boolean;       // default false: several models reject it
    maxTokensParam: 'max_completion_tokens' | 'max_tokens';
    extraBody?: Record<string, unknown>;   // reasoning/thinking knobs, OpenRouter routing
    extraHeaders?: Record<string, string>;
    costSource: 'usage.cost' | 'price_table';
    price: { inputPerM: number; outputPerM: number }; // required: the budget needs it either way
    timeoutMs: number;
    maxConcurrency: number;
  }
  ```

- **Environment:** keep `OPENROUTER_API_KEY` and `OPENROUTER_BASE_URL`; add `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `LLM_RELAY_BASE_URL` / `LLM_RELAY_API_KEY` (a second relay is another profile with its own env names). Feature switches: `COACH_COMMENTARY_PROFILE` (unset: the feature is off), `COACH_JUDGE_PROFILE` (eval tools only), `LLM_BOT_PROFILES` (`claude:<id>,gpt:<id>`, mapping the existing `AgentModel` labels), `LLM_DAILY_BUDGET_USD`. A referenced profile with missing env vars fails startup with `invalid_server_config`, as `config.ts` does today.
- **Cost:** charge `usage.cost` when the provider reports it (OpenRouter does on every response); otherwise tokens × the profile's price; if usage is missing too (some relays), keep the reservation as the charge and flag the cost as estimated. Before each call, reserve the worst case (input estimate plus `maxOutputTokens` at the output price) against every scope (daily, room, player) and settle afterwards, so concurrent calls overspend by at most one reservation. The ledger is in memory: a restart resets the daily cap.
- **Failure handling:** an `AbortSignal` deadline per call (commentary 10 s; bots use their turn budget). One retry on 429, 5xx or a network error, only with at least 40% of the deadline left, honouring `retry-after`; never on 400, 401 or 403. A circuit breaker per profile: open for 60 s after 5 consecutive failures, for 15 min with a loud log on 401/403; while open, commentary answers `unavailable` and bots fall back at once. A semaphore per profile; a request whose wait exceeds its deadline fails fast.
- **Recorded responses:** `LLM_CASSETTE=off|record|replay` with a directory, keyed by the sha256 of the model and the canonical request body; no headers or keys are stored. CI runs `replay` only, and a miss is an error.
- **The bots migrate onto it** (`llm-bots.md`, step B1): `agent-engine` already takes an injected `AgentLlmClient`, so the layer implements that interface and `openrouter-client.ts` goes, its quirks becoming profile settings.
- **Anthropic:** in v1 through OpenRouter, or through Anthropic's OpenAI-compatible endpoint in `prompt` mode, which Anthropic describes as for testing, not production. A native Messages adapter (schema-enforced output, prompt caching; about 150 lines, estimate) is step P1b, added only if official Anthropic becomes a production provider (open question 3).

### Grounding

**What the model gets: a fact sheet built from the record.** Values are pre-rendered by the UI's own formatters (`percent`, `frequencyLabel`, `formatSpr`, `formatPotOddsRatio`, `formatChips`), which move from `apps/web` to `packages/shared` so the server and the UI share them.

- Spot: hero cards, board, pot, to call, effective stack in big blinds, SPR, position, opponents.
- Equity and price: equity and its error, what it is against, required equity, pot odds and ratio, and the gap between equity and required equity (so the model does no arithmetic); the preflop hand percentile; booleans such as `clears_price`.
- Policy: each option's action, total, size and frequency; the frequency the policy gives the hero's comparable action (from a helper `gradeDecision` shares); `stable`; the verdict; whether the action was a timeout.
- Reasons: each code with its parameters as fact keys; `sticky_opponent`'s player becomes a position label.
- The betting line before the decision, by position; the hand's category from the engine's evaluator.
- In the system prompt: a glossary of the reason codes and the verdict rules (25%, ±50%, unstable never off), and the rule that only glossary concepts may be used.

**What it must not get:**

- Player names and ids. Both are user-controlled; leaving them out removes the injection surface instead of sanitising it.
- Anyone else's cards, mucked cards, the deck: the record is built from the hero's viewer hand, so they are absent by construction.
- The result of the hand, showdown cards and payouts, to avoid outcome bias ("you lost because…"), and the session tally.

**Output schema (static, strict-compatible):** `{ verdict: 'matched'|'close'|'off', cites: CoachReasonCode[], summary: string, takeaway: string | null }`, where `cites` is an enum of every reason code. Prose writes numbers and cards only as `{keys}`.

### Validation

Every rule is a hard failure, counted per rule for the evals:

1. The zod schema.
2. No digit left after removing `{key}`s and an allow-list (`3-bet`, `4-bet`, `5-bet`, `c-bet`).
3. No spelled-out quantities: "percent", "times", "twice"; `百分之`, and Chinese numerals followed by `成`, `倍` or `个百分点`.
4. Every `{key}` exists in this record's fact sheet.
5. No card tokens (`[2-9TJQKA][hdcs]`, suit glyphs) outside fact keys.
6. `cites` is a non-empty subset of the record's reason codes (empty only when it has none).
7. The stated verdict equals the record's.
8. A forbidden lexicon in en and zh: EV, GTO, solver, optimal, equilibrium, 期望值, 最优, 求解器; "you must", 你必须, 一定要; result words (won, lost the pot, 赢了, 输了); URLs.
9. Length after rendering: summary at most 300 characters in en, 150 in zh; takeaway 140 and 70 (estimates, tuned on the dev set).
10. Language: zh text contains CJK, en text none.
11. No run of 8 words copied from the system prompt.

On failure: one repair call carrying the errors; if that fails, `{ ok: false, error: 'failed' }`, and the row shows one quiet line ("No commentary for this decision") under its reasons. Unvalidated text is never served.

The validator cannot catch a wrong direction ("your equity cleared the price" when it didn't) or invented theory ("range advantage", "blockers"). The booleans in the fact sheet, the glossary rule, the judge and human spot checks cover those.

### Safety

- **Prompt injection:** no user-controlled string reaches the prompt; the locale is a zod enum. A test builds a room with a player named "Ignore previous instructions…" and a crafted id and asserts neither appears in any prompt.
- **Hidden information:** the fact sheet is deep-equal after permuting opponents' hole cards and the deck (as in `coach-advice.md`); a dataset check that every card in a sample is the hero's or on the board.
- **Output:** rendered as React text, never HTML or markdown; length-capped; no URLs.
- **Limits:** one request in flight per player and at most 20 per 10 minutes (reusing the fixed-window rate limiter); a per-player session spend cap and a global daily cap (amounts are open question 2). When the budget runs out, later reviews carry `commentary: false`.
- **No provider configured:** `commentary: false`, no affordance, and the handler answers `unavailable` without calling the provider (tested).

### Evals

**Dataset.**

- **A new tool `apps/server/src/tools/coach-samples.ts`** (`pnpm --filter @aipoker/server coach:samples`). A seeded six-max table where the hero's seat is not a bot. The hero's policy is drawn per hand from a mix (TAG 40%, Fish 15%, LAG 15%, calling station 10%, a uniformly random legal action 20%), and 3% of hero decisions time out, played as the server's timeout plays them (the mix alone never times out).
- **Opponents:** the training table's rule bots, with one seat a calling station. The rule bots all fold to bets too often for the policy to read anyone as sticky, so without that seat `sticky_opponent` never appears.
- **It records through the production functions** (advice, capture, `takeHandReviews`), so samples are production records, written as JSONL to the git-ignored `apps/server/.eval/coach-samples/`. It must bump `stateVersion` per action, because the kept advice is keyed by it, and `playSimulatedHand` in the simulator does not bump it.
- **Bot play is untouched:** this is a new tool, and `bot-play-digest.test.ts` stays as is.
- **Size and split:**
  - 1,500 hands by default (about 2,900 decisions); at 1,000, river × close had too few for both sets;
  - a dev set of 150 for prompt work and a held-out golden set of 150 from disjoint hands, each stratified street × verdict (12 cells, at least 10 each); the golden set fills from at most half of each cell, so the rare cells leave enough for the dev set;
  - the golden set holds at least 20 unstable, 30 multiway and 10 each with `price_*`, `jam`, `sticky_opponent`, `position_range` and timeouts.
- **Golden labels by the author:**
  - the key reason codes per item (proposed automatically, then reviewed);
  - for 40 items, a short reference explanation in en and zh, used to calibrate the judge.
- **Versioning:** the golden file is committed with its `policyVersion`. A bump of `COACH_POLICY_VERSION` means a deliberate regeneration and relabel.

**Metrics, per profile and locale:**

- **Deterministic:**
  - schema validity on the first try;
  - pass rate of each validator rule on the first try;
  - the rate of "no commentary" after repair;
  - recall of the key reasons;
  - verdict agreement;
  - length and language.
- **Judge** (a different model family from the generator):
  - unsupported claim, contradiction of a fact, and prescriptive tone, each yes or no;
  - helpfulness 1-5;
  - pairwise preference against the templated baseline, with positions swapped.
- **Judge calibration:** the author labels 40 items blind (20 per locale); the judge must agree on at least 80% of the yes/no labels before its numbers count (κ reported).
- **Operations:** end-to-end latency p50/p95 through the production `explainDecision()`; input, output and reasoning tokens; cost per explanation; repair rate.

**Running it:**

- `pnpm eval:commentary --set golden --profiles a,b,c --locales en,zh` writes JSONL per profile and a summary table. Results are committed to `Docs/game-design/coach-commentary-eval.md`, like `bot-eval.md`; raw output goes to a git-ignored `apps/server/.eval/`.
- CI runs with no network and no keys:
  - validator table tests (pass and fail cases per rule, both locales);
  - a prompt digest pinned to `COACH_COMMENTARY_VERSION` (a prompt change without a version bump fails);
  - the injection and permutation tests;
  - a replay of 10 golden items through the whole pipeline.
- Live runs are manual, within a budget the user approves.

**Ship thresholds** (proposed; open question 5). On the golden set, chosen profile, both locales:

- 100% of served outputs pass the hard checks;
- at least 90% pass on the first try, and at most 2% end with no commentary;
- the judge finds unsupported claims in at most 5% and contradictions in at most 2%;
- human spot check, 30 per locale: no contradictions, at most 2 unsupported claims;
- against the template, the LLM is preferred in at least 60% of non-tie judgments, with the 95% CI lower bound above 50%;
- key-reason recall at least 80%;
- p50 at most 3 s, p95 at most 6 s;
- cost per explanation under the user's ceiling.

If the template comparison fails, the UI doesn't ship. The provider layer, dataset and evals remain as the deliverable, with an honest result.

### Persistence

No product persistence. The dataset comes from a deterministic generator, so it can be rebuilt from code and a seed; only the golden file and the summary tables are committed. An optional dev-only `COACH_SAMPLE_DUMP=<path>` that appends the author's own review records to a local, git-ignored JSONL and refuses to run in production would add real mistakes to compare against the synthetic ones (about 30 lines; open question 6).

## Implementation plan

Each step is one PR; a gate must pass before the next starts.

1. **P1: provider layer, and `.env*` added to `.gitignore`.**
   - Tests with a fake `fetch`: each structured mode; fence stripping; missing usage charged at the reservation; a 429 with `retry-after` within the deadline; a 401 opening the breaker; abort on timeout; concurrent calls overspending by at most one reservation; a cassette round trip; a lint that every schema object lists all its properties as required with `additionalProperties: false`.
   - **Gate:** a live smoke, user-approved, at most $0.05: one JSON call per configured profile, cassettes recorded, and a table of the usage fields each provider actually returned.
2. **P2: the LLM bots move onto the layer** (`llm-bots.md` B1). This fixes the uncapped cost.
3. **C1: dataset.** `line` added to the record, and `coach-samples.ts`.
   - **Gate:** the same seed gives the same file hash; a stratification table with every target met; the card-leak check over the whole file passes; the digest test is unchanged.
4. **C2: commentary core, server only.** The fact sheet, prompt v1, schema, validator, renderer, `explainDecision()`, the eval runner and the judge.
   - **Gate:** CI green; prompt work on the dev set, then one golden run per candidate profile; the judge calibrated; the thresholds met; the results document committed. Budget about $10-30 (estimate; open question 2).
5. **C3: realtime.** The `coach:explain` handler, rate limits, budget scopes, cache, `GameReviewEvent.commentary`.
   - **Gate:** integration tests:
     - only the player's own reviews can be explained;
     - the feature switched off makes no provider call;
     - an exhausted budget answers `budget`;
     - a cache hit calls the provider once;
     - a game action during a pending explain is applied at once;
     - the injection and permutation tests.
6. **C4: web.** The store, the request on expand, en and zh copy, the unavailable state.
   - **Gate:** store tests; the zh table typechecks; a browser check (review servers, en and zh, 1440 and 375 wide): opening a row shows the text, coach off hides it, a reload at hand end keeps it working; `pnpm typecheck`, `pnpm lint`, `pnpm test`.

After P1 the commentary track (C1-C4) and the bot track (`llm-bots.md`) are independent and can run in parallel.

## Validation

- Unit: the validator's table tests in both locales; the provider layer's fake-`fetch` tests; the prompt digest; the fact-sheet permutation and injection tests.
- Offline: a replay of 10 golden items through the full pipeline in CI.
- Live, manual and budgeted: the P1 smoke and the C2 golden runs, with results in `coach-commentary-eval.md`.
- Realtime and browser checks as in steps C3 and C4.

## Risks

1. **The LLM only paraphrases the reasons.** Caught by the comparison with the template in C2, before any UI work.
2. **Plausible but wrong poker claims without numbers.** The judge's unsupported-claim rate and human spot checks; mitigated by the glossary rule and the booleans.
3. **Fact keys hurt the prose or are ignored,** especially in zh. A 30-item dev run per model early in C2; if first-try adherence is under 90% for every candidate, switch to free numbers checked against the fact sheet's values.
4. **Hidden reasoning tokens raise cost and latency.** Some models think by default: log reasoning tokens, set the thinking knobs in the profile, and size the reservation from `maxOutputTokens`.
5. **Relay quirks** (no `response_format`, no usage, fenced JSON, an error body with HTTP 200). Caught by the P1 smoke and first-try validity per profile.
6. **Prompt overfitting to the golden set.** The dev/golden split; one golden run per prompt version.
7. **A policy change invalidates the golden labels.** Records carry `policyVersion` and the generator is deterministic.
8. **Judge bias.** A different model family, swapped positions, calibration.

## Open questions

1. **Models and cost.** The estimates assume about 1,500 input and 150 output tokens per explanation and a 5% repair rate (to be replaced by the P1 smoke and C2 dev runs). Prices are by tier, from the vault note `Knowledge/research/llm-slow-planner-model-comparison.md` (checked 2026-10-11; re-check before deciding, and use the `claude-api` reference for Anthropic). Thinking left on multiplies output cost by 4-13× and adds 2-10 s (estimate). Relay prices must be entered per profile.

   | Tier (USD per M tokens, in/out) | Per explanation | 100-hand session, one explanation per hand |
   |---|---|---|
   | 0.10/0.50 | about $0.0002 | about $0.02 |
   | 0.15/0.60 | about $0.0003 | about $0.03 |
   | 0.75/3.75 | about $0.0017 | about $0.17 |
   | 2/10 | about $0.0045 | about $0.45 |

   A bake-off of 4 profiles × 150 golden items × 2 locales, judged by a strong-tier model with swapped positions, is about $10-30.
2. **Budgets:** the live eval budget for C2, `LLM_DAILY_BUDGET_USD`, and the per-player commentary cap.
3. **Anthropic:** is official Anthropic a production provider? If yes, add the native adapter (P1b); otherwise Claude goes through OpenRouter.
4. **Scope:** one decision per request in v1, deferring a narrative per hand and follow-up questions?
5. **Ship thresholds** above, especially the requirement to beat the template.
6. **The dev-only dump** of the author's own play.
7. **Send `line` to the client** in `CoachReviewDecision`, or keep it server-only?

## Sources (checked 2026-10-12 by the design review)

- Anthropic, OpenAI SDK compatibility (testing-only status; `response_format` and `strict` ignored; temperature, forced tool use and usage limits): https://platform.claude.com/docs/en/api/openai-sdk
- Anthropic, structured outputs (`output_config.format`, grammar caching): https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- OpenAI, structured outputs (strict schema rules; JSON mode needs "JSON"): https://developers.openai.com/api/docs/guides/structured-outputs
- OpenRouter, usage accounting (`usage.cost` on every response): https://openrouter.ai/docs/use-cases/usage-accounting
- OpenRouter, structured outputs and provider routing (`require_parameters`): https://openrouter.ai/docs/features/structured-outputs, https://openrouter.ai/docs/features/provider-routing
- Unverified: whether every candidate OpenAI model supports `json_schema` on Chat Completions; the P1 smoke shows it.
