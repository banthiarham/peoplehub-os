/**
 * The signed payload a location QR encodes. A code claims where someone is
 * standing to a server that cannot see them, so it is signed and short-lived;
 * the punch path takes the location from the verified payload, never from the
 * scanning client.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const QR_TOKEN_PREFIX = 'PHUB2';

export const QR_ROTATE_MS = 10_000;

/**
 * How long a code stays punchable, and the single source of that number — the
 * issuing response reports it as `expiresInMs` so no client restates it. The
 * window is the exposure of a photographed code relayed offsite, so it is kept
 * as short as scan reliability allows.
 */
export const QR_ACCEPT_MS = 3 * QR_ROTATE_MS;

export interface QrTokenPayload {
  /** Tenant, so a code can never be replayed into another workspace. */
  t: string;
  /** Location the display stands at. */
  l: string;
  /** Display that issued it, for tracing a punch back to a screen. */
  d: string;
  /** Issue time, epoch seconds. */
  i: number;
  /** Makes two codes issued in the same second distinct. */
  n: string;
}

export type QrTokenFailure = 'malformed' | 'signature' | 'expired';

export interface QrVerifyResult {
  payload?: QrTokenPayload;
  failure?: QrTokenFailure;
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function signature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/** Constant-time compare that tolerates length mismatch without throwing. */
function signatureMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signQrToken(
  payload: Omit<QrTokenPayload, 'i' | 'n'> & { i?: number; n?: string },
  secret: string,
): string {
  const body = base64url(
    JSON.stringify({
      t: payload.t,
      l: payload.l,
      d: payload.d,
      i: payload.i ?? Math.floor(Date.now() / 1000),
      n: payload.n ?? randomBytes(6).toString('base64url'),
    } satisfies QrTokenPayload),
  );
  return `${QR_TOKEN_PREFIX}.${body}.${signature(body, secret)}`;
}

/**
 * `secrets` is the current signing secret followed by any previous one, so a
 * rotation does not invalidate the codes already on screen. Signature is
 * checked before expiry so a tampered token never reports as merely stale.
 */
export function verifyQrToken(
  token: string,
  secrets: string[],
  now: Date = new Date(),
): QrVerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== QR_TOKEN_PREFIX) return { failure: 'malformed' };

  const [, body, provided] = parts;
  if (!secrets.some((secret) => signatureMatches(signature(body, secret), provided))) {
    return { failure: 'signature' };
  }

  let payload: QrTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as QrTokenPayload;
  } catch {
    return { failure: 'malformed' };
  }
  if (!payload?.t || !payload.l || !payload.d || typeof payload.i !== 'number') {
    return { failure: 'malformed' };
  }

  // Future-dated codes count as expired: the only way to sign one is a moved clock.
  const ageMs = now.getTime() - payload.i * 1000;
  if (ageMs > QR_ACCEPT_MS || ageMs < -QR_ACCEPT_MS) return { failure: 'expired' };

  return { payload };
}
