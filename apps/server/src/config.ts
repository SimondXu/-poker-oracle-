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
  SECURE_COOKIES: booleanFromEnvSchema,
  AUTH_STRICT: booleanFromEnvSchema
});

export interface ServerConfig {
  host: string;
  port: number;
  corsOrigin: string;
  authSecret: string;
  authCookieName: string;
  authTtlSeconds: number;
  secureCookies: boolean;
  authStrict: boolean;
}

export type ServerConfigResult =
  | { ok: true; value: ServerConfig }
  | { ok: false; error: 'invalid_server_config' };

export function parseServerConfig(env: Record<string, string | undefined>): ServerConfigResult {
  const parsed = serverConfigSchema.safeParse(env);
  if (!parsed.success) {
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
      secureCookies: parsed.data.SECURE_COOKIES ?? false,
      authStrict: parsed.data.AUTH_STRICT ?? false
    }
  };
}
