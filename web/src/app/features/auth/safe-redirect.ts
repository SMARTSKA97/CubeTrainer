/** Only allow in-app paths as post-login targets (blocks open redirects like //evil.com). */
export function safeReturnUrl(url: string | undefined | null, fallback = '/today'): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.includes('://')
    ? url
    : fallback;
}
