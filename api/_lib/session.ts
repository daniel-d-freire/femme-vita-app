import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const COOKIE_NAME = 'fv_session';
const ALGO = 'aes-256-gcm';
const SESSION_TTL_DAYS = 30;

export type SessionData = {
  /** Google OAuth refresh token — used to mint new access tokens */
  refreshToken: string;
  /** Latest access token (may be expired; refresh if needed) */
  accessToken: string;
  /** UNIX ms timestamp when access_token expires */
  expiresAt: number;
  /** Resolved Apolo folder ID (cached after first lookup) */
  apoloFolderId?: string;
  /** Profile (for UI) */
  user: {
    email: string;
    name?: string;
    picture?: string;
  };
};

function getSecret(): Buffer {
  const raw = process.env.SESSION_SECRET;
  if (!raw) throw new Error('SESSION_SECRET não configurada.');
  // Accept hex (64 chars = 32 bytes) or base64 (44 chars = 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const b = Buffer.from(raw, 'base64');
  if (b.length === 32) return b;
  // Fallback: derive from arbitrary string via SHA-256
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSession(data: SessionData): string {
  const key = getSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

export function decryptSession(token: string): SessionData | null {
  try {
    const key = getSecret();
    const buf = Buffer.from(token, 'base64url');
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8')) as SessionData;
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((c) => {
      const idx = c.indexOf('=');
      if (idx === -1) return [c.trim(), ''];
      return [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())];
    })
  );
}

export function readSession(req: VercelRequest): SessionData | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return decryptSession(token);
}

export function writeSession(res: VercelResponse, data: SessionData): void {
  const token = encryptSession(data);
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  const cookie = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
  appendSetCookie(res, cookie);
}

export function clearSession(res: VercelResponse): void {
  const cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
  appendSetCookie(res, cookie);
}

function appendSetCookie(res: VercelResponse, cookie: string): void {
  const existing = res.getHeader('Set-Cookie');
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
  } else if (typeof existing === 'string') {
    res.setHeader('Set-Cookie', [existing, cookie]);
  } else {
    res.setHeader('Set-Cookie', cookie);
  }
}
