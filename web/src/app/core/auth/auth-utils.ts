/** Pure helpers for the auth screens (no Angular imports, so Node can test them). */

export interface ApiProblem {
  status: number;
  code: string;
  message: string;
  details: string[];
}

/** Turns an RFC 9457 problem response (or anything else a failed request produced) into one friendly shape. */
export function toProblem(err: unknown): ApiProblem {
  const e = err as { status?: number; error?: Record<string, unknown> | null } | null;
  const status = typeof e?.status === 'number' ? e.status : 0;
  const body = e?.error && typeof e.error === 'object' ? e.error : null;
  const code =
    typeof body?.['code'] === 'string' ? body['code'] : status === 0 ? 'network' : 'error';
  const detail = typeof body?.['detail'] === 'string' ? body['detail'] : '';
  const details = Array.isArray(body?.['errors'])
    ? (body['errors'] as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  if (status === 0)
    return {
      status,
      code,
      message: 'Cannot reach the server. Check your connection and try again.',
      details: [],
    };
  if (status === 429)
    return {
      status,
      code: code === 'error' ? 'rate_limited' : code,
      message: detail || 'Too many attempts. Wait a minute and try again.',
      details,
    };
  return { status, code, message: detail || 'Something went wrong. Please try again.', details };
}

export type Strength = 0 | 1 | 2 | 3 | 4;

/**
 * A rough, length-first strength meter (NIST 800-63B favours length over character rules).
 * 0 = too short, 4 = long passphrase. The server still enforces the real policy and checks breaches.
 */
export function passwordStrength(pw: string, minLength: number): Strength {
  if (pw.length < minLength) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const unique = new Set(pw).size;
  if (/^(.)\1+$/.test(pw) || unique < 5) return 1;
  if (pw.length >= 20 || (pw.length >= 16 && classes >= 2)) return 4;
  if (pw.length >= 14 || (pw.length >= 12 && classes >= 2)) return 3;
  return 2;
}

export const STRENGTH_LABEL: Record<Strength, string> = {
  0: 'Too short',
  1: 'Weak',
  2: 'Okay',
  3: 'Good',
  4: 'Strong',
};

/** "Chrome on Windows" style label from a user agent string. */
export function describeAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /okhttp|CubeTrainer/i.test(ua)
              ? 'CubeTrainer app'
              : 'Browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iOS/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

/** Region guess from the browser language, e.g. "en-IN" gives "IN". */
export function regionFromLocale(locale: string | undefined): string | null {
  const m = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(locale ?? '');
  return m ? m[1].toUpperCase() : null;
}

/** Messages for the ?error= / ?linkError= codes the social-login redirects carry. */
const EXTERNAL_ERRORS: Record<string, string> = {
  external_denied: 'Sign-in was cancelled.',
  external_failed: 'The provider did not complete the sign-in. Please try again.',
  state_mismatch: 'That sign-in attempt expired. Please try again.',
  link_expired: 'That request expired. Please try again.',
  email_in_use:
    'An account with this email already exists. Sign in with your password, then connect the provider in Settings.',
  identity_in_use: 'That account is already connected to a different CubeTrainer account.',
  email_not_verified: 'Confirm your email address first.',
};

export function externalErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return EXTERNAL_ERRORS[code] ?? 'Sign-in failed. Please try again.';
}
