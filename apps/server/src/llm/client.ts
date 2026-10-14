import type { BudgetLedger, BudgetScope } from './budget.ts';
import { cassetteKey, readCassette, writeCassette, type CassetteConfig } from './cassette.ts';
import type { ResolvedLlmProfile } from './profiles.ts';
import { parseOutput, responseFormat, schemaInstruction, type OutputSchema } from './structured.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** `ms` from the start of the call (capped by the profile's timeout); `signal` lets the caller abort sooner. */
export interface LlmDeadline {
  ms: number;
  signal?: AbortSignal;
}

export interface GenerateOptions<T> {
  /** The caller's semantic checks; each string is an error sent back on repair. */
  validate?: (value: T) => string[];
  /** One extra call that sends the errors back when the reply fails parsing or validation. */
  repair?: boolean;
}

export interface LlmUsage {
  input: number;
  output: number;
  cachedInput: number | null;
  reasoning: number | null;
}

/** One HTTP call (or cassette replay); a network error is an `http_error` with no status. */
export interface LlmAttempt {
  requestHash: string;
  latencyMs: number;
  status: 'ok' | 'http_error' | 'timeout' | 'aborted' | 'cassette_miss';
  httpStatus: number | null;
  usage: LlmUsage | null;
  costUsd: number;
  costEstimated: boolean;
  /** The reply's content, or the error body; at most 4 KB. */
  raw: string;
  /** Parse and validation errors for this reply. */
  errors: string[];
}

export type LlmError = 'breaker_open' | 'budget' | 'http_error' | 'timeout' | 'aborted' | 'invalid_output' | 'cassette_miss';

export type LlmResult<T> = ({ ok: true; value: T } | { ok: false; error: LlmError }) & {
  attempts: LlmAttempt[];
  costUsd: number;
};

export interface LlmClient {
  generateJson<T>(
    profile: ResolvedLlmProfile,
    messages: ChatMessage[],
    schema: OutputSchema<T>,
    deadline: LlmDeadline,
    scope: BudgetScope[],
    options?: GenerateOptions<T>,
  ): Promise<LlmResult<T>>;
}

export interface LlmClientDeps {
  ledger: BudgetLedger;
  cassette: CassetteConfig;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  log?: (message: string) => void;
}

const RAW_LIMIT = 4096;
const RETRY_MIN_LEFT = 0.4;
const BREAKER_FAILURES = 5;
const BREAKER_OPEN_MS = 60_000;
const BREAKER_AUTH_OPEN_MS = 15 * 60_000;

interface BreakerState {
  failures: number;
  openUntil: number;
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

export function createLlmClient(deps: LlmClientDeps): LlmClient {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string) => console.error(message));
  const breakers = new Map<string, BreakerState>();
  const semaphores = new Map<string, Semaphore>();

  function breaker(profileId: string): BreakerState {
    let state = breakers.get(profileId);
    if (!state) {
      state = { failures: 0, openUntil: 0 };
      breakers.set(profileId, state);
    }
    return state;
  }

  // Failures stay counted after the breaker closes again, so one more failure reopens it.
  function recordHealth(profile: ResolvedLlmProfile, attempt: LlmAttempt): void {
    const state = breaker(profile.id);
    if (attempt.status === 'ok') {
      state.failures = 0;
    } else if (attempt.httpStatus === 401 || attempt.httpStatus === 403) {
      state.openUntil = now() + BREAKER_AUTH_OPEN_MS;
      log(`[llm] profile ${profile.id}: HTTP ${attempt.httpStatus}; check ${profile.apiKeyEnv}. Breaker open for 15 min.`);
    } else if (attempt.status === 'http_error' || attempt.status === 'timeout') {
      state.failures += 1;
      if (state.failures >= BREAKER_FAILURES) {
        state.openUntil = now() + BREAKER_OPEN_MS;
        log(`[llm] profile ${profile.id}: ${state.failures} consecutive failures. Breaker open for 60 s.`);
      }
    }
  }

  async function send(
    profile: ResolvedLlmProfile,
    body: Record<string, unknown>,
    reservationUsd: number,
    signal: AbortSignal,
  ): Promise<{ attempt: LlmAttempt; content: string | null; retryAfterMs: number | null }> {
    const requestHash = cassetteKey(profile.model, body);
    const startedAt = now();
    const attempt: LlmAttempt = {
      requestHash,
      latencyMs: 0,
      status: 'ok',
      httpStatus: null,
      usage: null,
      costUsd: 0,
      costEstimated: false,
      raw: '',
      errors: [],
    };
    let retryAfterMs: number | null = null;
    let text: string;

    try {
      if (deps.cassette.mode === 'replay') {
        const recorded = await readCassette(deps.cassette.dir, requestHash);
        if (recorded === null) {
          return { attempt: { ...attempt, status: 'cassette_miss' }, content: null, retryAfterMs };
        }
        attempt.httpStatus = 200;
        text = recorded;
      } else {
        const response = await fetchImpl(`${profile.endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${profile.apiKey}`,
            'content-type': 'application/json',
            ...profile.extraHeaders,
          },
          body: JSON.stringify(body),
          signal,
        });
        attempt.httpStatus = response.status;
        retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), now());
        text = await response.text();
        if (!response.ok) {
          return {
            attempt: { ...attempt, status: 'http_error', latencyMs: now() - startedAt, raw: text.slice(0, RAW_LIMIT) },
            content: null,
            retryAfterMs,
          };
        }
      }
    } catch {
      // The provider may have billed a call we never heard back from: charge the reservation.
      const status = !signal.aborted ? 'http_error' : signal.reason === 'timeout' ? 'timeout' : 'aborted';
      return {
        attempt: { ...attempt, status, latencyMs: now() - startedAt, costUsd: reservationUsd, costEstimated: true },
        content: null,
        retryAfterMs,
      };
    }

    attempt.latencyMs = now() - startedAt;
    if (deps.cassette.mode === 'record') {
      await writeCassette(deps.cassette.dir, requestHash, { model: profile.model, request: body, response: text });
    }
    let payload: ChatCompletion & { error?: unknown };
    try {
      payload = JSON.parse(text) as ChatCompletion & { error?: unknown };
    } catch {
      payload = {};
    }
    const content = payload.choices?.[0]?.message?.content;
    if (payload.error !== undefined || typeof content !== 'string') {
      // Some relays answer an error with HTTP 200.
      return { attempt: { ...attempt, status: 'http_error', raw: text.slice(0, RAW_LIMIT) }, content: null, retryAfterMs };
    }

    const cost = computeCost(profile, payload.usage, reservationUsd);
    return {
      attempt: { ...attempt, usage: normalizeUsage(payload.usage), ...cost, raw: content.slice(0, RAW_LIMIT) },
      content,
      retryAfterMs,
    };
  }

  return {
    async generateJson(profile, messages, schema, deadline, scope, options = {}) {
      const attempts: LlmAttempt[] = [];
      const finish = <T>(result: { ok: true; value: T } | { ok: false; error: LlmError }): LlmResult<T> => ({
        ...result,
        attempts,
        costUsd: attempts.reduce((sum, attempt) => sum + attempt.costUsd, 0),
      });

      if (breaker(profile.id).openUntil > now()) {
        return finish({ ok: false, error: 'breaker_open' });
      }

      const totalMs = Math.min(deadline.ms, profile.timeoutMs);
      const deadlineAt = now() + totalMs;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort('timeout'), totalMs);
      const onCallerAbort = () => controller.abort('aborted');
      if (deadline.signal?.aborted) {
        onCallerAbort();
      }
      deadline.signal?.addEventListener('abort', onCallerAbort, { once: true });
      const signal = controller.signal;
      const abortedError = (): LlmError => (signal.reason === 'timeout' ? 'timeout' : 'aborted');

      let semaphore = semaphores.get(profile.id);
      if (!semaphore) {
        semaphore = createSemaphore(profile.maxConcurrency);
        semaphores.set(profile.id, semaphore);
      }

      let release: () => void;
      try {
        release = await semaphore.acquire(signal);
      } catch {
        clearTimeout(timer);
        deadline.signal?.removeEventListener('abort', onCallerAbort);
        return finish({ ok: false, error: abortedError() });
      }

      // One transport retry on 429, 5xx or a network error, only with enough of the deadline left.
      async function call(conversation: ChatMessage[]): Promise<{ content: string } | { error: LlmError }> {
        const body = buildBody(profile, conversation, schema);
        for (let attemptIndex = 0; ; attemptIndex += 1) {
          const reservationUsd = reserveUsd(profile, body);
          const reservation = deps.ledger.reserve(scope, reservationUsd);
          if (!reservation) {
            return { error: 'budget' };
          }
          const sent = await send(profile, body, reservationUsd, signal);
          deps.ledger.settle(reservation, sent.attempt.costUsd);
          attempts.push(sent.attempt);
          recordHealth(profile, sent.attempt);

          if (sent.content !== null) {
            return { content: sent.content };
          }
          const { status, httpStatus } = sent.attempt;
          if (status !== 'http_error') {
            return { error: status === 'cassette_miss' ? 'cassette_miss' : abortedError() };
          }
          const retryable = httpStatus === null || httpStatus === 429 || httpStatus >= 500;
          const waitMs = sent.retryAfterMs ?? 0;
          const breakerOpen = breaker(profile.id).openUntil > now();
          if (attemptIndex > 0 || !retryable || breakerOpen || deadlineAt - now() - waitMs < RETRY_MIN_LEFT * totalMs) {
            return { error: 'http_error' };
          }
          if (!(await sleep(waitMs, signal))) {
            return { error: abortedError() };
          }
        }
      }

      try {
        let conversation = withSchemaInstruction(profile, messages, schema);
        const rounds = options.repair ? 2 : 1;
        for (let round = 0; round < rounds; round += 1) {
          const reply = await call(conversation);
          if ('error' in reply) {
            return finish({ ok: false, error: reply.error });
          }
          const parsed = parseOutput(reply.content, schema, options.validate);
          if (parsed.ok) {
            return finish({ ok: true, value: parsed.value });
          }
          attempts[attempts.length - 1]!.errors = parsed.errors;
          conversation = [
            ...conversation,
            { role: 'assistant', content: reply.content },
            { role: 'user', content: repairMessage(parsed.errors) },
          ];
        }
        return finish({ ok: false, error: 'invalid_output' });
      } finally {
        release();
        clearTimeout(timer);
        deadline.signal?.removeEventListener('abort', onCallerAbort);
      }
    },
  };
}

function buildBody(
  profile: ResolvedLlmProfile,
  messages: ChatMessage[],
  schema: OutputSchema<unknown>,
): Record<string, unknown> {
  const format = responseFormat(profile.structured, schema);
  return {
    model: profile.model,
    messages,
    [profile.maxTokensParam]: profile.maxOutputTokens,
    ...(profile.temperature !== null ? { temperature: profile.temperature } : {}),
    ...(format ? { response_format: format } : {}),
    ...profile.extraBody,
  };
}

function withSchemaInstruction(
  profile: ResolvedLlmProfile,
  messages: ChatMessage[],
  schema: OutputSchema<unknown>,
): ChatMessage[] {
  if (profile.structured === 'json_schema') {
    return messages;
  }
  const instruction = schemaInstruction(schema);
  const [first, ...rest] = messages;
  return first?.role === 'system'
    ? [{ role: 'system', content: `${first.content}\n\n${instruction}` }, ...rest]
    : [{ role: 'system', content: instruction }, ...messages];
}

function repairMessage(errors: string[]): string {
  return `Your reply was rejected:\n${errors.map((error) => `- ${error}`).join('\n')}\nReply again with one corrected JSON object only.`;
}

// Worst case: the whole body as input (about 3 UTF-8 bytes per token covers English and Chinese)
// plus the full output cap, reasoning included.
function reserveUsd(profile: ResolvedLlmProfile, body: Record<string, unknown>): number {
  const inputTokens = Math.ceil(Buffer.byteLength(JSON.stringify(body), 'utf8') / 3);
  return tokenCost(profile, inputTokens, profile.maxOutputTokens);
}

function tokenCost(profile: ResolvedLlmProfile, inputTokens: number, outputTokens: number): number {
  return (inputTokens * profile.price.inputPerM + outputTokens * profile.price.outputPerM) / 1_000_000;
}

function computeCost(
  profile: ResolvedLlmProfile,
  usage: ChatCompletion['usage'],
  reservationUsd: number,
): { costUsd: number; costEstimated: boolean } {
  if (profile.costSource === 'usage.cost' && isCount(usage?.cost)) {
    return { costUsd: usage.cost, costEstimated: false };
  }
  if (isCount(usage?.prompt_tokens) && isCount(usage?.completion_tokens)) {
    return { costUsd: tokenCost(profile, usage.prompt_tokens, usage.completion_tokens), costEstimated: false };
  }
  return { costUsd: reservationUsd, costEstimated: true };
}

function normalizeUsage(usage: ChatCompletion['usage']): LlmUsage | null {
  if (!isCount(usage?.prompt_tokens) || !isCount(usage?.completion_tokens)) {
    return null;
  }
  const cached = usage.prompt_tokens_details?.cached_tokens;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  return {
    input: usage.prompt_tokens,
    output: usage.completion_tokens,
    cachedInput: isCount(cached) ? cached : null,
    reasoning: isCount(reasoning) ? reasoning : null,
  };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseRetryAfter(header: string | null, nowMs: number): number | null {
  if (!header) {
    return null;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - nowMs);
}

/** Resolves false if the signal aborts first. */
function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

interface Semaphore {
  /** Waits for a slot; rejects if the signal aborts first. Resolves to the release function. */
  acquire(signal: AbortSignal): Promise<() => void>;
}

function createSemaphore(max: number): Semaphore {
  let active = 0;
  const waiters: Array<() => void> = [];

  function grant(): () => void {
    active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active -= 1;
      waiters.shift()?.();
    };
  }

  return {
    acquire(signal) {
      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        if (active < max) {
          resolve(grant());
          return;
        }
        const wake = () => {
          signal.removeEventListener('abort', onAbort);
          resolve(grant());
        };
        const onAbort = () => {
          waiters.splice(waiters.indexOf(wake), 1);
          reject(signal.reason);
        };
        waiters.push(wake);
        signal.addEventListener('abort', onAbort, { once: true });
      });
    },
  };
}
