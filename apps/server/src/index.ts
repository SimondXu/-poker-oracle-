import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';

import { DEFAULT_AUTH_COOKIE_NAME } from './auth/cookies.ts';
import { verifyGuestSessionToken } from './auth/session-token.ts';
import { registerAuthRoutes } from './http/auth-routes.ts';
import { createFixedWindowRateLimiter } from './http/rate-limit.ts';

export interface HealthStatus {
  service: 'aipoker-server';
  nowMs: number;
  ok: true;
}

export function createHealthStatus(nowMs: number): HealthStatus {
  return {
    service: 'aipoker-server',
    nowMs,
    ok: true
  };
}

export interface ServerDependencies {
  nowMs: () => number;
  authSecret?: string;
  authCookieName?: string;
  authTtlSeconds?: number;
  corsOrigin?: string;
  secureCookies?: boolean;
  httpRateLimitPerMinute?: number;
}

export function createServer(deps: ServerDependencies): FastifyInstance {
  const server = Fastify({
    logger: false
  });

  const authSecret = deps.authSecret ?? 'dev-guest-secret-change-me';
  const authCookieName = deps.authCookieName ?? DEFAULT_AUTH_COOKIE_NAME;
  const authTtlSeconds = deps.authTtlSeconds ?? 60 * 60 * 24 * 30;
  const corsOrigin = deps.corsOrigin ?? 'http://localhost:3000';
  const secureCookies = deps.secureCookies ?? false;
  const httpRateLimitPerMinute = deps.httpRateLimitPerMinute ?? 100;
  const rateLimit = createFixedWindowRateLimiter(60_000);

  void server.register(cors, {
    origin: corsOrigin,
    credentials: true
  });
  void server.register(cookie);
  server.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) {
      return;
    }

    const sessionToken = request.cookies[authCookieName];
    const session = sessionToken
      ? verifyGuestSessionToken({
          token: sessionToken,
          nowMs: deps.nowMs(),
          secret: authSecret
        })
      : null;
    const identityKey = session ? `user:${session.userId}` : `ip:${request.ip}`;
    const rateLimitResult = rateLimit(identityKey, deps.nowMs(), httpRateLimitPerMinute);
    if (rateLimitResult.allowed) {
      return;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitResult.resetAtMs - deps.nowMs()) / 1000));
    return reply
      .code(429)
      .header('retry-after', String(retryAfterSeconds))
      .send({ ok: false, error: 'rate_limited' });
  });

  server.get('/health', async () => createHealthStatus(deps.nowMs()));
  registerAuthRoutes(server, {
    nowMs: deps.nowMs,
    authSecret,
    authCookieName,
    authTtlSeconds,
    secureCookies
  });

  return server;
}
