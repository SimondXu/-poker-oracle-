import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * One isolated `claude -p` per decision, on the user's subscription (`llm-bots.md`, "CLI players").
 * `--bare` is never used (it reads only ANTHROPIC_API_KEY, so it would bill the API) and neither is
 * `--fallback-model` (it would switch the row's model silently).
 */
export const CLAUDE_ISOLATION_ARGS = [
  '--tools', '',
  '--setting-sources', '',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--no-session-persistence',
] as const;

export const CHILD_ENV_KEYS = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'TMPDIR'] as const;

/** These would move billing or routing off the subscription; the runner refuses to start if any is set. */
const FORBIDDEN_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL'];

const KILL_GRACE_MS = 2_000;

export function buildClaudeArgs(input: { model: string; effort: string; systemPrompt: string; schema: object }): string[] {
  return [
    '-p',
    '--model', input.model,
    '--effort', input.effort,
    '--system-prompt', input.systemPrompt,
    '--output-format', 'json',
    '--json-schema', JSON.stringify(input.schema),
    ...CLAUDE_ISOLATION_ARGS,
  ];
}

/** A hash of the flag set and the child environment's shape: the canary is valid only for this hash. */
export function flagsSha(): string {
  const skeleton = buildClaudeArgs({ model: '<model>', effort: '<effort>', systemPrompt: '<system>', schema: {} });
  return createHash('sha256').update(JSON.stringify({ skeleton, env: CHILD_ENV_KEYS })).digest('hex');
}

/** The only environment a child sees: no keys, no tokens, nothing the runner holds in memory. */
export function childEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of CHILD_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

/** Names of the forbidden variables that are set. Presence only: values are never read into a message. */
export function forbiddenEnvNames(source: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(source).filter((name) => (FORBIDDEN_ENV.includes(name) || name.startsWith('CLAUDE_CODE_USE_')) && source[name] !== undefined);
}

export interface Preflight {
  version: string;
  subscriptionType: string | null;
}

/** Refuses to run unless the child will bill the subscription. Reads only `authMethod` and `subscriptionType`. */
export function preflight(source: NodeJS.ProcessEnv = process.env): Preflight {
  const forbidden = forbiddenEnvNames(source);
  if (forbidden.length > 0) {
    throw new Error(`Refusing to run: ${forbidden.join(', ')} set; unset ${forbidden.length === 1 ? 'it' : 'them'} so calls bill the subscription`);
  }
  const env = childEnv(source);
  const version = spawnSync('claude', ['--version'], { env, encoding: 'utf8' });
  if (version.status !== 0) {
    throw new Error('Refusing to run: `claude --version` failed');
  }
  const status = spawnSync('claude', ['auth', 'status'], { env, encoding: 'utf8' });
  let auth: { authMethod?: unknown; subscriptionType?: unknown } = {};
  try {
    auth = JSON.parse(status.stdout) as typeof auth;
  } catch {
    // Falls through to the refusal below.
  }
  if (auth.authMethod !== 'claude.ai') {
    throw new Error('Refusing to run: `claude auth status` does not report the claude.ai subscription sign-in');
  }
  return {
    version: version.stdout.trim(),
    subscriptionType: typeof auth.subscriptionType === 'string' ? auth.subscriptionType : null,
  };
}

export interface RunClaudeOptions {
  cwd: string;
  env: Record<string, string>;
  stdin: string;
  deadlineMs: number;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  ms: number;
}

export type RunFn = (args: string[], options: RunClaudeOptions) => Promise<RunResult>;

/**
 * Starts `claude` with no shell, so empty-string arguments survive, in its own process group. At the
 * deadline the group gets SIGTERM, and SIGKILL 2 s later. A failure to start comes back as exit code
 * null with the reason in `stderr`.
 */
export const runClaude: RunFn = (args, { cwd, env, stdin, deadlineMs }) =>
  new Promise((resolve) => {
    const started = performance.now();
    const chunks = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
    let timedOut = false;
    let settled = false;
    const timers: NodeJS.Timeout[] = [];

    const child = spawn('claude', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true, shell: false });
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-child.pid!, signal);
      } catch {
        // Already gone.
      }
    };
    const finish = (exitCode: number | null, error?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      timers.forEach(clearTimeout);
      resolve({
        stdout: Buffer.concat(chunks.stdout).toString('utf8'),
        stderr: error ?? Buffer.concat(chunks.stderr).toString('utf8'),
        exitCode,
        timedOut,
        ms: performance.now() - started,
      });
    };

    timers.push(setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      timers.push(setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS));
    }, deadlineMs));
    child.stdout.on('data', (chunk: Buffer) => chunks.stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => chunks.stderr.push(chunk));
    child.stdin.on('error', () => undefined);
    child.on('error', (error) => finish(null, `spawn failed: ${error.message}`));
    child.on('close', (code) => finish(code));
    child.stdin.end(stdin);
  });

// ---- output

export interface ClaudeUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  thinking: number;
}

export interface ClaudeCallMeta {
  numTurns: number;
  durationApiMs: number | null;
  ttftMs: number | null;
  usage: ClaudeUsage;
  /** What the call would list at, not what the subscription is charged. */
  notionalUsd: number | null;
  models: string[];
  permissionDenials: number;
  stopReason: string | null;
}

export type ClaudeFailure = 'usage_limit' | 'rate_limit' | 'auth' | 'timeout' | 'spawn_error' | 'bad_json' | 'error';

export type ClaudeOutcome =
  | { kind: 'ok'; structured: unknown; meta: ClaudeCallMeta }
  /** The call worked but broke an isolation rule: a stop-the-run condition. */
  | { kind: 'violation'; reason: 'model_drift' | 'permission_denied' | 'too_many_turns'; detail: string; meta: ClaudeCallMeta }
  | { kind: ClaudeFailure; detail: string };

const USAGE_LIMIT = /usage limit|hit your limit|limit reached|out of (extra )?usage|weekly limit|5-hour limit|resets? (at|in|on)\b/i;
const RATE_LIMIT = /rate.?limit|too many requests|overloaded/i;
const AUTH = /not logged in|\/login|invalid (api key|bearer|authentication|token|x-api-key)|authenticat|unauthori[sz]ed|oauth|credentials/i;

function classifyError(status: unknown, text: string): ClaudeFailure {
  if (USAGE_LIMIT.test(text)) {
    return 'usage_limit';
  }
  if (status === 429 || RATE_LIMIT.test(text)) {
    return 'rate_limit';
  }
  if (status === 401 || status === 403 || AUTH.test(text)) {
    return 'auth';
  }
  return 'error';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function metaOf(output: Record<string, unknown>): ClaudeCallMeta {
  const modelUsage = (output.modelUsage && typeof output.modelUsage === 'object' ? output.modelUsage : {}) as Record<string, Record<string, unknown>>;
  const usage: ClaudeUsage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, thinking: 0 };
  for (const entry of Object.values(modelUsage)) {
    usage.input += num(entry.inputTokens);
    usage.output += num(entry.outputTokens);
    usage.cacheRead += num(entry.cacheReadInputTokens);
    usage.cacheCreation += num(entry.cacheCreationInputTokens);
    usage.thinking += num(entry.thinkingTokens);
  }
  return {
    numTurns: num(output.num_turns),
    durationApiMs: typeof output.duration_api_ms === 'number' ? output.duration_api_ms : null,
    ttftMs: typeof output.ttft_ms === 'number' ? output.ttft_ms : null,
    usage,
    notionalUsd: typeof output.total_cost_usd === 'number' ? output.total_cost_usd : null,
    models: Object.keys(modelUsage),
    permissionDenials: Array.isArray(output.permission_denials) ? output.permission_denials.length : 0,
    stopReason: typeof output.stop_reason === 'string' ? output.stop_reason : null,
  };
}

/**
 * Classifies one `claude -p --output-format json` run. With `expect`, a success is checked against
 * the row: only its model in `modelUsage`, no permission denial, at most `maxTurns` turns.
 */
export function parseClaudeOutput(
  stdout: string,
  exitCode: number | null,
  timedOut: boolean,
  expect?: { model: string; maxTurns: number },
): ClaudeOutcome {
  if (timedOut) {
    return { kind: 'timeout', detail: 'deadline passed' };
  }
  if (exitCode === null) {
    return { kind: 'spawn_error', detail: 'no exit code' };
  }
  let output: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(stdout.trim());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    output = parsed as Record<string, unknown>;
  } catch {
    const failure = classifyError(null, stdout);
    return { kind: failure === 'error' ? 'bad_json' : failure, detail: stdout.trim().slice(0, 200) };
  }

  const text = typeof output.result === 'string' ? output.result : '';
  if (output.is_error === true || (output.subtype !== undefined && output.subtype !== 'success')) {
    return { kind: classifyError(output.api_error_status, text), detail: text.slice(0, 200) || String(output.subtype) };
  }

  const meta = metaOf(output);
  if (expect) {
    if (meta.permissionDenials > 0) {
      return { kind: 'violation', reason: 'permission_denied', detail: `${meta.permissionDenials} permission denial(s)`, meta };
    }
    const others = meta.models.filter((model) => model !== expect.model);
    if (others.length > 0) {
      return { kind: 'violation', reason: 'model_drift', detail: `modelUsage names ${others.join(', ')}, row is ${expect.model}`, meta };
    }
    if (meta.numTurns > expect.maxTurns) {
      return { kind: 'violation', reason: 'too_many_turns', detail: `${meta.numTurns} turns, at most ${expect.maxTurns}`, meta };
    }
  }
  const structured = output.structured_output;
  if (!structured || typeof structured !== 'object' || Array.isArray(structured)) {
    return { kind: 'bad_json', detail: `no structured_output; result starts: ${text.slice(0, 120)}` };
  }
  return { kind: 'ok', structured, meta };
}

// ---- canary gate

export const CANARY_PATH = new URL('../../.eval/cli-canary.json', import.meta.url);

/** Throws unless the canary last passed on this `claude` version and flag set. */
export function assertCanary(version: string, path: URL = CANARY_PATH): void {
  let record: { claudeVersion?: unknown; flagsSha?: unknown } = {};
  try {
    record = JSON.parse(readFileSync(path, 'utf8')) as typeof record;
  } catch {
    // No canary yet.
  }
  if (record.claudeVersion !== version || record.flagsSha !== flagsSha()) {
    throw new Error(`Refusing to run: the canary has not passed on ${version} with this flag set; run \`pnpm --filter @aipoker/server eval:cli-canary\``);
  }
}
