import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createGuestSessionToken, verifyGuestSessionToken } from '../auth/session-token.ts';

const guestAuthPayloadSchema = z
  .object({
    username: z.string().trim().min(1).max(32).optional()
  })
  .strict();

interface RegisterAuthRoutesOptions {
  nowMs: () => number;
  authSecret: string;
  authCookieName: string;
  authTtlSeconds: number;
  secureCookies: boolean;
}

function buildGuestUsername(userId: string): string {
  return `Guest-${userId.slice(0, 6)}`;
}

export function registerAuthRoutes(server: FastifyInstance, options: RegisterAuthRoutesOptions): void {
  server.post('/api/auth/guest', async (request, reply) => {
    const parsed = guestAuthPayloadSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }

    const existingToken = request.cookies[options.authCookieName];
    const existingSession = existingToken
      ? verifyGuestSessionToken({
          token: existingToken,
          nowMs: options.nowMs(),
          secret: options.authSecret
        })
      : null;

    const userId = existingSession?.userId ?? randomUUID();
    const username = parsed.data.username ?? existingSession?.username ?? buildGuestUsername(userId);

    const token = createGuestSessionToken({
      userId,
      username,
      nowMs: options.nowMs(),
      ttlSeconds: options.authTtlSeconds,
      secret: options.authSecret
    });

    reply.setCookie(options.authCookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: options.secureCookies,
      path: '/',
      maxAge: options.authTtlSeconds
    });

    return reply.send({
      ok: true,
      user: {
        id: userId,
        username,
        isGuest: true
      }
    });
  });

  server.get('/api/auth/me', async (request, reply) => {
    const token = request.cookies[options.authCookieName];
    if (!token) {
      return reply.code(401).send({ ok: false, error: 'unauthorized' });
    }

    const session = verifyGuestSessionToken({
      token,
      nowMs: options.nowMs(),
      secret: options.authSecret
    });
    if (!session) {
      return reply.code(401).send({ ok: false, error: 'unauthorized' });
    }

    return reply.send({
      ok: true,
      user: {
        id: session.userId,
        username: session.username,
        isGuest: true
      }
    });
  });

  server.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(options.authCookieName, {
      path: '/'
    });
    return reply.send({ ok: true });
  });
}
