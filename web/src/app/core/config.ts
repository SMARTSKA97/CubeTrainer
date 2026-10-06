/**
 * Runtime configuration, read from /config.json before the app starts.
 * Local dev and Docker: "/api/v1" (same origin, proxied). Cloudflare Pages: the full Render URL,
 * written at build time by scripts/write-config.mjs from the API_URL environment variable.
 */
let base = '/api/v1';

export function apiBase(): string {
  return base;
}

export async function loadConfig(): Promise<void> {
  try {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (!res.ok) return;
    const cfg = (await res.json()) as { apiBase?: string };
    if (cfg.apiBase && typeof cfg.apiBase === 'string') base = cfg.apiBase.replace(/\/+$/, '');
  } catch {
    /* keep the default */
  }
}
