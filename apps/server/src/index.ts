import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

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

const DEFAULT_CSP_CONNECT_SOURCES = ['http://localhost:3000', 'http://127.0.0.1:3000'];

function isLocalDevHostname(hostname: string): boolean {
  return (
    hostname === 'localhost'
    || hostname === '0.0.0.0'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    || /^10(?:\.\d{1,3}){3}$/.test(hostname)
    || /^192\.168(?:\.\d{1,3}){2}$/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(hostname)
  );
}

function isAllowedCorsOrigin(origin: string, configuredOrigin?: string): boolean {
  if (configuredOrigin) {
    return origin === configuredOrigin;
  }

  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.port === '3000' && isLocalDevHostname(url.hostname);
  } catch {
    return false;
  }
}

export function createServer(deps: ServerDependencies): FastifyInstance {
  const server = Fastify({
    logger: false
  });

  const authSecret = deps.authSecret ?? 'dev-guest-secret-change-me';
  const authCookieName = deps.authCookieName ?? DEFAULT_AUTH_COOKIE_NAME;
  const authTtlSeconds = deps.authTtlSeconds ?? 60 * 60 * 24 * 30;
  const corsOrigin = deps.corsOrigin;
  const secureCookies = deps.secureCookies ?? false;
  const httpRateLimitPerMinute = deps.httpRateLimitPerMinute ?? 100;
  const rateLimit = createFixedWindowRateLimiter(60_000);

  void server.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }

      cb(null, isAllowedCorsOrigin(origin, corsOrigin));
    },
    credentials: true
  });
  void server.register(cookie);
  void server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        connectSrc: ["'self'", ...(corsOrigin ? [corsOrigin] : DEFAULT_CSP_CONNECT_SOURCES), 'ws:', 'wss:']
      }
    },
    crossOriginEmbedderPolicy: false
  });
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
