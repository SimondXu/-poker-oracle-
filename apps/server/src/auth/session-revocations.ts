import { verifyGuestSessionToken, type GuestSession } from './session-token.ts';

// Tokens are stateless, so logout records the token here until it would have expired anyway.
// In-memory only: a restart forgets revocations, which a persistent session store would fix.
export interface SessionRevocations {
  revoke: (token: string, expiresAtSeconds: number, nowMs: number) => void;
  isRevoked: (token: string) => boolean;
}

export function createSessionRevocations(): SessionRevocations {
  const expiresAtByToken = new Map<string, number>();

  return {
    revoke(token, expiresAtSeconds, nowMs) {
      const nowSeconds = Math.floor(nowMs / 1000);
      for (const [revokedToken, expiresAt] of expiresAtByToken) {
        if (expiresAt <= nowSeconds) {
          expiresAtByToken.delete(revokedToken);
        }
      }
      expiresAtByToken.set(token, expiresAtSeconds);
    },
    isRevoked(token) {
      return expiresAtByToken.has(token);
    },
  };
}

export function resolveGuestSession(input: {
  token: string | undefined;
  nowMs: number;
  secret: string;
  revocations: SessionRevocations;
}): GuestSession | null {
  if (!input.token || input.revocations.isRevoked(input.token)) {
    return null;
  }

  return verifyGuestSessionToken({ token: input.token, nowMs: input.nowMs, secret: input.secret });
}
