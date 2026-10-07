/**
 * Runtime configuration, read from /config.json before the app starts.
 * Local dev and Docker: "/api/v1" (same origin, proxied). Cloudflare Pages: the full Render URL,
 * written at build time by scripts/write-config.mjs from the API_URL environment variable.
 */
let base = '/api/v1';
let repo = '';
let contactEmail = '';
let operatorName = '';

/** Who runs the service, shown in the Terms and Privacy Policy. Set CONTACT_EMAIL / OPERATOR_NAME when building (scripts/write-config.mjs). */
export function contact(): { email: string; operator: string } {
  return {
    email: contactEmail || '[contact email not configured]',
    operator: operatorName || 'the CubeTrainer operator',
  };
}

/** "owner/name" of the GitHub repository whose releases carry the Android APK; empty = in-app updates off. */
export function updatesRepo(): string {
  return repo;
}

export function apiBase(): string {
  return base;
}

export async function loadConfig(): Promise<void> {
  try {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (!res.ok) return;
    const cfg = (await res.json()) as {
      apiBase?: string;
      updatesRepo?: string;
      contactEmail?: string;
      operatorName?: string;
    };
    if (typeof cfg.updatesRepo === 'string') repo = cfg.updatesRepo;
    if (typeof cfg.contactEmail === 'string') contactEmail = cfg.contactEmail;
    if (typeof cfg.operatorName === 'string') operatorName = cfg.operatorName;
    if (cfg.apiBase && typeof cfg.apiBase === 'string') base = cfg.apiBase.replace(/\/+$/, '');
  } catch {
    /* keep the default */
  }
}
