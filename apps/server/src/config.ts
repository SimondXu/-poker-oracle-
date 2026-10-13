import type { AgentModel } from '@aipoker/shared';
import { z } from 'zod';

import type { CassetteConfig } from './llm/cassette.ts';
import { DEFAULT_OPENROUTER_BASE_URL, resolveLlmProfile, type ResolvedLlmProfile } from './llm/profiles.ts';

const AGENT_MODELS = ['claude', 'gpt', 'gemini', 'grok', 'minimax'] as const satisfies readonly AgentModel[];

// `claude:<profile>,gpt:<profile>`: each AgentModel label at most once.
const botProfilesSchema = z.string().trim().min(1).transform((value, context) => {
  const profiles: Partial<Record<AgentModel, string>> = {};
  for (const entry of value.split(',')) {
    const [model, profileId, ...extra] = entry.split(':').map((part) => part.trim());
    const known = (AGENT_MODELS as readonly string[]).includes(model ?? '');
    if (!known || !profileId || extra.length > 0 || profiles[model as AgentModel]) {
      context.addIssue({ code: 'custom', message: `invalid LLM_BOT_PROFILES entry: ${entry}` });
      return z.NEVER;
    }
    profiles[model as AgentModel] = profileId;
  }
  return profiles;
});

const booleanFromEnvSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
      return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no') {
      return false;
    }
  }
  return value;
}, z.boolean().optional());

const serverConfigSchema = z.object({
  NODE_ENV: z.string().trim().optional(),
  HOST: z.string().trim().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  CORS_ORIGIN: z.string().trim().min(1).optional(),
  AUTH_SECRET: z.string().trim().min(16).optional(),
  AUTH_COOKIE_NAME: z.string().trim().min(1).optional(),
  AUTH_TTL_SECONDS: z.coerce.number().int().min(60).optional(),
  HTTP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).optional(),
  SECURE_COOKIES: booleanFromEnvSchema,
  AUTH_STRICT: booleanFromEnvSchema,
  OPENROUTER_API_KEY: z.string().trim().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().trim().url().optional(),
  OPENROUTER_HTTP_REFERER: z.string().trim().url().optional(),
  OPENROUTER_APP_TITLE: z.string().trim().min(1).optional(),
  LLM_AGENT_ENABLED: booleanFromEnvSchema,
  LLM_AGENT_REALTIME_TARGET_MS: z.coerce.number().int().min(1).optional(),
  LLM_AGENT_REALTIME_TIMEOUT_MS: z.coerce.number().int().min(1).optional(),
  LLM_AGENT_EVAL_TIMEOUT_MS: z.coerce.number().int().min(1).optional(),
  LLM_AGENT_MAX_TOOL_ROUNDS_REALTIME: z.coerce.number().int().min(0).optional(),
  LLM_AGENT_MAX_TOOL_ROUNDS_EVAL: z.coerce.number().int().min(0).optional(),
  LLM_AGENT_MAX_PROMPT_TOKENS: z.coerce.number().int().min(1).optional(),
  LLM_AGENT_MAX_COMPLETION_TOKENS: z.coerce.number().int().min(1).optional(),
  LLM_AGENT_ROOM_COST_LIMIT_USD: z.coerce.number().positive().optional(),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
  LLM_RELAY_BASE_URL: z.string().trim().url().optional(),
  LLM_RELAY_API_KEY: z.string().trim().min(1).optional(),
  COACH_COMMENTARY_PROFILE: z.string().trim().min(1).optional(),
  COACH_JUDGE_PROFILE: z.string().trim().min(1).optional(),
  LLM_BOT_PROFILES: botProfilesSchema.optional(),
  LLM_DAILY_BUDGET_USD: z.coerce.number().positive().optional(),
  LLM_CASSETTE: z.enum(['off', 'record', 'replay']).optional(),
  LLM_CASSETTE_DIR: z.string().trim().min(1).optional(),
});

export interface ServerConfig {
  host: string;
  port: number;
  corsOrigin: string;
  authSecret: string;
  authCookieName: string;
  authTtlSeconds: number;
  httpRateLimitPerMinute: number;
  secureCookies: boolean;
  authStrict: boolean;
  openRouterApiKey: string | null;
  openRouterBaseUrl: string;
  openRouterHttpReferer: string | null;
  openRouterAppTitle: string;
  llmAgentEnabled: boolean;
  llmAgentRealtimeTargetMs: number;
  llmAgentRealtimeTimeoutMs: number;
  llmAgentEvalTimeoutMs: number;
  llmAgentMaxToolRoundsRealtime: number;
  llmAgentMaxToolRoundsEval: number;
  llmAgentMaxPromptTokens: number;
  llmAgentMaxCompletionTokens: number;
  llmAgentRoomCostLimitUsd: number;
  /** Every profile referenced below, with its endpoint and key resolved. */
  llmProfiles: Record<string, ResolvedLlmProfile>;
  /** null: commentary is off. */
  coachCommentaryProfile: string | null;
  coachJudgeProfile: string | null;
  llmBotProfiles: Partial<Record<AgentModel, string>>;
  llmDailyBudgetUsd: number;
  llmCassette: CassetteConfig;
}

export type ServerConfigResult =
  | { ok: true; value: ServerConfig }
  | { ok: false; error: 'invalid_server_config' };

export function parseServerConfig(env: Record<string, string | undefined>): ServerConfigResult {
  const parsed = serverConfigSchema.safeParse(env);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_server_config' };
  }

  if ((parsed.data.LLM_AGENT_ENABLED ?? false) && !parsed.data.OPENROUTER_API_KEY) {
    return { ok: false, error: 'invalid_server_config' };
  }

  const llmCassette = parseCassette(parsed.data.LLM_CASSETTE ?? 'off', parsed.data.LLM_CASSETTE_DIR);
  if (!llmCassette) {
    return { ok: false, error: 'invalid_server_config' };
  }

  // Profiles may only read these variables; a referenced profile must resolve.
  const openRouterBaseUrl = parsed.data.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL;
  const llmEnv = {
    OPENROUTER_API_KEY: parsed.data.OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL: openRouterBaseUrl,
    OPENAI_API_KEY: parsed.data.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: parsed.data.ANTHROPIC_API_KEY,
    LLM_RELAY_BASE_URL: parsed.data.LLM_RELAY_BASE_URL,
    LLM_RELAY_API_KEY: parsed.data.LLM_RELAY_API_KEY,
  };
  const llmBotProfiles = parsed.data.LLM_BOT_PROFILES ?? {};
  const referencedProfiles = [
    parsed.data.COACH_COMMENTARY_PROFILE,
    parsed.data.COACH_JUDGE_PROFILE,
    ...Object.values(llmBotProfiles),
  ].filter((id): id is string => id !== undefined);
  const llmProfiles: Record<string, ResolvedLlmProfile> = {};
  for (const id of referencedProfiles) {
    const profile = resolveLlmProfile(id, llmEnv);
    if (!profile) {
      return { ok: false, error: 'invalid_server_config' };
    }
    llmProfiles[id] = profile;
  }

  // The dev fallback secret is public, so production must provide its own.
  const isProduction = parsed.data.NODE_ENV === 'production';
  if (isProduction && !parsed.data.AUTH_SECRET) {
    return { ok: false, error: 'invalid_server_config' };
  }

  return {
    ok: true,
    value: {
      host: parsed.data.HOST ?? '0.0.0.0',
      port: parsed.data.PORT ?? 3001,
      corsOrigin: parsed.data.CORS_ORIGIN ?? 'http://localhost:3000',
      authSecret: parsed.data.AUTH_SECRET ?? 'dev-guest-secret-change-me',
      authCookieName: parsed.data.AUTH_COOKIE_NAME ?? 'aipoker_session',
      authTtlSeconds: parsed.data.AUTH_TTL_SECONDS ?? 60 * 60 * 24 * 30,
      httpRateLimitPerMinute: parsed.data.HTTP_RATE_LIMIT_PER_MINUTE ?? 100,
      secureCookies: parsed.data.SECURE_COOKIES ?? isProduction,
      authStrict: parsed.data.AUTH_STRICT ?? true,
      openRouterApiKey: parsed.data.OPENROUTER_API_KEY ?? null,
      openRouterBaseUrl,
      openRouterHttpReferer: parsed.data.OPENROUTER_HTTP_REFERER ?? null,
      openRouterAppTitle: parsed.data.OPENROUTER_APP_TITLE ?? 'AiPoker',
      llmAgentEnabled: parsed.data.LLM_AGENT_ENABLED ?? false,
      llmAgentRealtimeTargetMs: parsed.data.LLM_AGENT_REALTIME_TARGET_MS ?? 5000,
      llmAgentRealtimeTimeoutMs: parsed.data.LLM_AGENT_REALTIME_TIMEOUT_MS ?? 8000,
      llmAgentEvalTimeoutMs: parsed.data.LLM_AGENT_EVAL_TIMEOUT_MS ?? 45000,
      llmAgentMaxToolRoundsRealtime: parsed.data.LLM_AGENT_MAX_TOOL_ROUNDS_REALTIME ?? 1,
      llmAgentMaxToolRoundsEval: parsed.data.LLM_AGENT_MAX_TOOL_ROUNDS_EVAL ?? 3,
      llmAgentMaxPromptTokens: parsed.data.LLM_AGENT_MAX_PROMPT_TOKENS ?? 4000,
      llmAgentMaxCompletionTokens: parsed.data.LLM_AGENT_MAX_COMPLETION_TOKENS ?? 600,
      llmAgentRoomCostLimitUsd: parsed.data.LLM_AGENT_ROOM_COST_LIMIT_USD ?? 1,
      llmProfiles,
      coachCommentaryProfile: parsed.data.COACH_COMMENTARY_PROFILE ?? null,
      coachJudgeProfile: parsed.data.COACH_JUDGE_PROFILE ?? null,
      llmBotProfiles,
      llmDailyBudgetUsd: parsed.data.LLM_DAILY_BUDGET_USD ?? 1,
      llmCassette,
    }
  };
}

function parseCassette(mode: 'off' | 'record' | 'replay', dir: string | undefined): CassetteConfig | null {
  if (mode === 'off') {
    return { mode };
  }
  return dir ? { mode, dir } : null;
}
