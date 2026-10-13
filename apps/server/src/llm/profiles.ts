export type StructuredMode = 'json_schema' | 'json_object' | 'prompt';

export interface LlmProfile {
  id: string;
  /** The only part a client ever sees. */
  label: string;
  /** A fixed public endpoint, or the env var that holds it. */
  baseUrl: string | { env: string };
  apiKeyEnv: string;
  model: string;
  structured: StructuredMode;
  /** null: not sent, since several models reject it. */
  temperature: number | null;
  maxTokensParam: 'max_completion_tokens' | 'max_tokens';
  /** The output cap sent with every call (hidden reasoning tokens included); also sizes the budget reservation. */
  maxOutputTokens: number;
  /** Reasoning/thinking knobs, OpenRouter routing. */
  extraBody?: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
  costSource: 'usage.cost' | 'price_table';
  /** USD per million tokens. Required: the budget reserves against it either way. */
  price: { inputPerM: number; outputPerM: number };
  /** Upper bound on any one call; a caller's deadline can only shorten it. */
  timeoutMs: number;
  maxConcurrency: number;
}

export interface ResolvedLlmProfile extends LlmProfile {
  endpoint: string;
  apiKey: string;
}

export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Prices checked 2026-10-11/12: OpenRouter endpoints API and the vault note
// Knowledge/research/llm-slow-planner-model-comparison.md; Anthropic from the claude-api reference.
// Unverified until the P1 live smoke: json_schema support per route and the reasoning knobs.
export const LLM_PROFILES: readonly LlmProfile[] = [
  {
    id: 'openrouter-gpt-6-luna',
    label: 'GPT-6 Luna',
    baseUrl: { env: 'OPENROUTER_BASE_URL' },
    apiKeyEnv: 'OPENROUTER_API_KEY',
    model: 'openai/gpt-6-luna',
    structured: 'json_schema',
    temperature: null,
    maxTokensParam: 'max_completion_tokens',
    maxOutputTokens: 1000,
    extraBody: { provider: { require_parameters: true }, reasoning: { effort: 'none' } },
    costSource: 'usage.cost',
    price: { inputPerM: 0.1, outputPerM: 0.5 },
    timeoutMs: 20_000,
    maxConcurrency: 4,
  },
  {
    id: 'openrouter-claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    baseUrl: { env: 'OPENROUTER_BASE_URL' },
    apiKeyEnv: 'OPENROUTER_API_KEY',
    model: 'anthropic/claude-haiku-5.5',
    structured: 'json_schema',
    temperature: null,
    maxTokensParam: 'max_completion_tokens',
    maxOutputTokens: 2000,
    extraBody: { provider: { require_parameters: true } },
    costSource: 'usage.cost',
    price: { inputPerM: 0.1, outputPerM: 0.5 },
    timeoutMs: 20_000,
    maxConcurrency: 4,
  },
  {
    id: 'openai-gpt-6-luna',
    label: 'GPT-6 Luna',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    model: 'gpt-6-luna',
    structured: 'json_schema',
    temperature: null,
    maxTokensParam: 'max_completion_tokens',
    maxOutputTokens: 1000,
    extraBody: { reasoning_effort: 'none' },
    costSource: 'price_table',
    price: { inputPerM: 0.1, outputPerM: 0.5 },
    timeoutMs: 20_000,
    maxConcurrency: 4,
  },
  {
    // Anthropic's OpenAI-compatible endpoint ignores response_format; Anthropic calls it for testing.
    id: 'anthropic-claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    model: 'claude-haiku-5-5',
    structured: 'prompt',
    temperature: null,
    maxTokensParam: 'max_tokens',
    maxOutputTokens: 2000,
    costSource: 'price_table',
    price: { inputPerM: 0.1, outputPerM: 0.5 },
    timeoutMs: 20_000,
    maxConcurrency: 4,
  },
  {
    // The price is OpenAI's list price until the relay's own is entered.
    id: 'relay-gpt-6-luna',
    label: 'GPT-6 Luna',
    baseUrl: { env: 'LLM_RELAY_BASE_URL' },
    apiKeyEnv: 'LLM_RELAY_API_KEY',
    model: 'gpt-6-luna',
    structured: 'prompt',
    temperature: null,
    maxTokensParam: 'max_tokens',
    maxOutputTokens: 1000,
    costSource: 'price_table',
    price: { inputPerM: 0.1, outputPerM: 0.5 },
    timeoutMs: 20_000,
    maxConcurrency: 4,
  },
];

/** The profile with its endpoint and key filled in, or null when it is unknown or an env var is missing. */
export function resolveLlmProfile(
  id: string,
  env: Record<string, string | undefined>,
): ResolvedLlmProfile | null {
  const profile = LLM_PROFILES.find((candidate) => candidate.id === id);
  if (!profile) {
    return null;
  }

  const endpoint = typeof profile.baseUrl === 'string' ? profile.baseUrl : env[profile.baseUrl.env];
  const apiKey = env[profile.apiKeyEnv];
  if (!endpoint || !apiKey) {
    return null;
  }

  return { ...profile, endpoint: endpoint.replace(/\/+$/, ''), apiKey };
}
