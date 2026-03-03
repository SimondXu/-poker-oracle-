import { z } from 'zod';

const serverConfigSchema = z.object({
  HOST: z.string().trim().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).optional()
});

export interface ServerConfig {
  host: string;
  port: number;
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
      port: parsed.data.PORT ?? 3001
    }
  };
}
