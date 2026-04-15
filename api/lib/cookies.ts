import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'pt_drive_token';

/** Compact signed cookie: v1|<hex-hmac>|token — avoids base64 expansion that breaks 4KB Set-Cookie limit. */
function signToken(accessToken: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(accessToken, 'utf8').digest('hex');
  return `v1|${sig}|${accessToken}`;
}

function verifyPipeSigned(value: string, secret: string): string | null {
  const parts = value.split('|');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [, sigHex, token] = parts;
  if (!sigHex || !token) return null;
  const expected = createHmac('sha256', secret).update(token, 'utf8').digest('hex');
  const a = Buffer.from(sigHex, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}

/** Legacy: v1.<base64url(payload)>.<base64url(hmac)> — may exceed cookie size for long tokens. */
function verifyLegacyDotSigned(value: string, secret: string): string | null {
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [, payload, sig] = parts;
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret)
    .update(`v1|${payload}`, 'utf8')
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/** Vercel/Node may pass `cookie` as string or string[] in edge cases. */
export function getCookieHeaderFromReq(req: { headers?: { cookie?: string | string[] } } | null) {
  const c = req?.headers?.cookie;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.join('; ');
  return undefined;
}

/**
 * Read Drive OAuth access token from Cookie header.
 * If `SESSION_SECRET` is set (pass `secret`), expects HMAC-signed `v1|*` or legacy `v1.*` cookie values.
 * If unset, accepts the legacy plain URL-encoded token (dev / older deploys).
 */
export function getTokenFromCookieHeader(
  cookieHeader: string | undefined | null,
  secret?: string | null
) {
  try {
    if (!cookieHeader) return null;
    const parts = cookieHeader.split(';').map((p) => p.trim());
    for (const part of parts) {
      if (!part.startsWith(`${COOKIE_NAME}=`)) continue;
      let raw = part.slice(COOKIE_NAME.length + 1);
      try {
        raw = decodeURIComponent(raw);
      } catch {
        /* keep raw */
      }

      const s = typeof secret === 'string' ? secret.trim() : '';
      if (s) {
        if (raw.startsWith('v1|')) {
          return verifyPipeSigned(raw, s);
        }
        if (raw.startsWith('v1.')) {
          return verifyLegacyDotSigned(raw, s);
        }
        return null;
      }

      return raw || null;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildSetTokenCookie(
  token: string,
  maxAgeSeconds = 60 * 60,
  secret?: string | null
) {
  const s = typeof secret === 'string' ? secret.trim() : '';
  const payload = s ? signToken(token, s) : token;
  return `${COOKIE_NAME}=${encodeURIComponent(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function buildClearTokenCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
