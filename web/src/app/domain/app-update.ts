/** Pure helpers for the in-app updater: read GitHub releases, decide whether one is newer than the installed app. */

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GithubRelease {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  assets?: ReleaseAsset[];
}

export interface AppUpdate {
  version: string;
  title: string;
  notes: string;
  publishedAt: string | null;
  url: string;
  size: number;
  fileName: string;
}

/** Release tags for the Android app look like "android-v1.4.2". */
export const TAG_PREFIX = 'android-v';

/** "1.4.2" -> [1,4,2]; anything that is not dotted numbers (optionally with a "-suffix") is rejected. */
export function parseVersion(v: string): number[] | null {
  const m = /^v?(\d+(?:\.\d+){0,3})(?:[-+].*)?$/.exec(v.trim());
  return m ? m[1].split('.').map(Number) : null;
}

/** Negative when a < b, 0 when equal, positive when a > b. Missing parts count as 0 ("1.2" == "1.2.0"). Unparseable -> 0. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Newest usable Android release that is newer than `installed`, or null. Drafts, pre-releases and releases without an APK are ignored. */
export function pickUpdate(
  releases: readonly GithubRelease[],
  installed: string,
): AppUpdate | null {
  let best: AppUpdate | null = null;
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.tag_name.startsWith(TAG_PREFIX)) continue;
    const version = r.tag_name.slice(TAG_PREFIX.length);
    if (!parseVersion(version)) continue;
    const apk = (r.assets ?? []).find((a) => a.name.toLowerCase().endsWith('.apk'));
    if (!apk) continue;
    if (compareVersions(version, installed) <= 0) continue;
    if (best && compareVersions(version, best.version) <= 0) continue;
    best = {
      version,
      title: r.name?.trim() || `Version ${version}`,
      notes: (r.body ?? '').trim(),
      publishedAt: r.published_at ?? null,
      url: apk.browser_download_url,
      size: apk.size,
      fileName: apk.name,
    };
  }
  return best;
}

/** GitHub release notes are Markdown; show them as readable plain text (bullets kept, headings and link syntax removed). */
export function notesToLines(notes: string): string[] {
  return notes
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^\s{0,3}#{1,6}\s*/, '')
        .replace(/^\s*[*+-]\s+/, '• ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/(\*\*|__|`)/g, '')
        .trimEnd(),
    )
    .filter((l, i, all) => l !== '' || (i > 0 && all[i - 1] !== ''));
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** The repository the app checks, from config ("owner/name"); anything else is refused so a bad value cannot point elsewhere. */
export const validRepo = (r: string | undefined | null): r is string =>
  !!r && /^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(r);
