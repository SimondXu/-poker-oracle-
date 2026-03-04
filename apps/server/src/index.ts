import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';

import { DEFAULT_AUTH_COOKIE_NAME } from './auth/cookies.ts';
import { registerAuthRoutes } from './http/auth-routes.ts';

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

  void server.register(cors, {
    origin: corsOrigin,
    credentials: true
  });
  void server.register(cookie);

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
