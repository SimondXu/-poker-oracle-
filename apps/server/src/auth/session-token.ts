import { createHmac, timingSafeEqual } from 'node:crypto';

export interface GuestSession {
  userId: string;
  username: string;
  isGuest: true;
  issuedAt: number;
  expiresAt: number;
}

interface GuestSessionTokenPayload {
  v: 1;
  sub: string;
  name: string;
  guest: true;
  iat: number;
  exp: number;
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const padded = input.padEnd(Math.ceil(input.length / 4) * 4, '=').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

function sign(payloadPart: string, secret: string): string {
  return toBase64Url(createHmac('sha256', secret).update(payloadPart).digest());
}

export function createGuestSessionToken(input: {
  userId: string;
  username: string;
  nowMs: number;
  ttlSeconds: number;
  secret: string;
}): string {
  const issuedAt = Math.floor(input.nowMs / 1000);
  const payload: GuestSessionTokenPayload = {
    v: 1,
    sub: input.userId,
    name: input.username,
    guest: true,
    iat: issuedAt,
    exp: issuedAt + input.ttlSeconds
  };

  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signaturePart = sign(payloadPart, input.secret);
  return `${payloadPart}.${signaturePart}`;
}

export function verifyGuestSessionToken(input: {
  token: string;
  nowMs: number;
  secret: string;
}): GuestSession | null {
  const [payloadPart, signaturePart] = input.token.split('.');
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expectedSignature = sign(payloadPart, input.secret);
  const actualBuffer = Buffer.from(signaturePart);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (actualBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  let payload: GuestSessionTokenPayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadPart).toString('utf8')) as GuestSessionTokenPayload;
  } catch {
    return null;
  }

  if (payload.v !== 1 || payload.guest !== true || typeof payload.sub !== 'string' || typeof payload.name !== 'string') {
    return null;
  }

  const nowSeconds = Math.floor(input.nowMs / 1000);
  if (payload.exp <= nowSeconds) {
    return null;
  }

  return {
    userId: payload.sub,
    username: payload.name,
    isGuest: true,
    issuedAt: payload.iat,
    expiresAt: payload.exp
  };
}
