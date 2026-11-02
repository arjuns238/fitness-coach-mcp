import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { config, isLoopback } from './config.ts';

const SESSION_COOKIE = 'fc_session';
const SESSION_SECONDS = 90 * 24 * 60 * 60;

const digest = (value: string) => createHash('sha256').update(value).digest();
const expectedKey = digest(config.apiKey);

export const authRequired = () => Boolean(config.apiKey);

export function keyMatches(presented: string | undefined): boolean {
  return presented !== undefined && timingSafeEqual(digest(presented), expectedKey);
}

/**
 * The keys a request presents: `Authorization: Bearer <key>` (or the bare key, since connector settings send the
 * header value exactly as typed) and `X-API-Key: <key>`. Surrounding whitespace, like a pasted newline, is ignored.
 */
function presentedKeys(req: IncomingMessage): string[] {
  const keys: string[] = [];
  const authorization = req.headers.authorization?.trim();
  if (authorization) keys.push(authorization.replace(/^bearer\s+/i, '').trim());
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.trim()) keys.push(apiKey.trim());
  return keys;
}

export const hasValidKey = (req: IncomingMessage) => presentedKeys(req).some(keyMatches);

// Sessions are `<issued-at>.<hmac>`, keyed by the API key and signed with the current epoch: rotating the key or
// bumping the epoch ("sign out everywhere") invalidates every existing cookie.
let epoch = 0;
export const setSessionEpoch = (value: number) => {
  epoch = value;
};
const sign = (issuedAt: string) => createHmac('sha256', config.apiKey).update(`session:${epoch}:${issuedAt}`).digest('base64url');

function validSession(token: string | undefined): boolean {
  if (!token) return false;
  const [issuedAt, signature] = token.split('.');
  if (!issuedAt || !signature) return false;
  const age = Date.now() / 1000 - Number(issuedAt);
  if (!(age >= 0 && age < SESSION_SECONDS)) return false;
  const expected = Buffer.from(sign(issuedAt));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function cookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

/** Dashboard requests: a session cookie, or the API key itself (handy for curl). */
export function dashboardAuthorized(req: IncomingMessage): boolean {
  if (!authRequired()) return true;
  return validSession(cookie(req, SESSION_COOKIE)) || hasValidKey(req);
}

function cookieAttributes(req: IncomingMessage) {
  // Hosts terminate TLS in front of the app and say so in X-Forwarded-Proto. Anywhere but loopback the
  // dashboard is only meant to be served over HTTPS, so the cookie is Secure there regardless.
  const secure = req.headers['x-forwarded-proto'] === 'https' || !isLoopback(config.host) ? '; Secure' : '';
  return `HttpOnly; SameSite=Strict; Path=/${secure}`;
}

export function sessionCookie(req: IncomingMessage): string {
  const issuedAt = String(Math.floor(Date.now() / 1000));
  return `${SESSION_COOKIE}=${issuedAt}.${sign(issuedAt)}; Max-Age=${SESSION_SECONDS}; ${cookieAttributes(req)}`;
}

export function clearedSessionCookie(req: IncomingMessage): string {
  return `${SESSION_COOKIE}=; Max-Age=0; ${cookieAttributes(req)}`;
}
