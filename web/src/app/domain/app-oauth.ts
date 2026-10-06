/** Pure helpers for social sign-in inside the Android app (browser round trip, PKCE-style secret, deep link back). */

export const APP_SCHEME = 'cubetrainer:';

export type AppLink =
  | { kind: 'done'; code: string; returnUrl: string | null }
  | { kind: 'two-factor'; challenge: string; returnUrl: string | null }
  | { kind: 'complete'; ticket: string; returnUrl: string | null }
  | { kind: 'error'; error: string };

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** 32 random bytes as base64url: the secret that never leaves the app until the final exchange. */
export function newVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** base64url(SHA-256(verifier)); the API computes the same value and compares. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/** Reads `cubetrainer://auth/<kind>?...`; anything else (other schemes or hosts, missing values) is ignored. */
export function parseAppLink(raw: string): AppLink | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== APP_SCHEME || u.hostname !== 'auth') return null;
  const q = u.searchParams;
  const returnUrl = q.get('returnUrl');
  switch (u.pathname.replace(/^\/+/, '')) {
    case 'done':
      return q.get('code') ? { kind: 'done', code: q.get('code')!, returnUrl } : null;
    case 'two-factor':
      return q.get('challenge')
        ? { kind: 'two-factor', challenge: q.get('challenge')!, returnUrl }
        : null;
    case 'complete':
      return q.get('ticket') ? { kind: 'complete', ticket: q.get('ticket')!, returnUrl } : null;
    case 'error':
      return { kind: 'error', error: q.get('error') ?? 'external_failed' };
    default:
      return null;
  }
}
