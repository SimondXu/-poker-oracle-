import { z } from 'zod';

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
      secureCookies: parsed.data.SECURE_COOKIES ?? false,
      authStrict: parsed.data.AUTH_STRICT ?? false,
      openRouterApiKey: parsed.data.OPENROUTER_API_KEY ?? null,
      openRouterBaseUrl: parsed.data.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
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
    }
  };
}
