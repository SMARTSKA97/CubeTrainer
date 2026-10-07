import { Injectable, signal } from '@angular/core';
import { isNative } from '@core/native';

const FIRST_CHECK = 5_000;
const EVERY = 30 * 60 * 1000;
const WHEN_VISIBLE_AFTER = 5 * 60 * 1000;
const RELOADED_AT = 'ct.reloadedAt';

/** "main-ABC123.js": the name Angular gives the entry script changes with every deploy, so it identifies the version. */
const ENTRY = /\bsrc="([^"]*\bmain(?:-[\w]+)?\.js)"/;

/**
 * New versions of the website arrive on their own (Cloudflare redeploys), but a tab or home-screen shortcut that is
 * already open keeps running the old files. This notices that the site has been redeployed and offers a reload.
 * It never reloads by itself, because that could interrupt a solve; the only automatic reload is the one-off
 * recovery when an old page asks for a file the new deploy no longer has.
 */
@Injectable({ providedIn: 'root' })
export class WebUpdateStore {
  /** The installed Android app updates through GitHub releases instead. */
  readonly enabled = !isNative() && typeof document !== 'undefined';
  readonly ready = signal(false);
  readonly dismissed = signal(false);
  private current = '';
  private lastCheck = 0;
  private started = false;

  start(): void {
    if (!this.enabled || this.started) return;
    this.started = true;
    this.current = this.runningEntry();
    if (!this.current) return; // dev server or an unrecognised build: nothing to compare with
    setTimeout(() => void this.check(), FIRST_CHECK);
    setInterval(() => void this.check(), EVERY);
    document.addEventListener('visibilitychange', () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - this.lastCheck > WHEN_VISIBLE_AFTER
      )
        void this.check();
    });
  }

  async check(): Promise<void> {
    if (!this.enabled || !this.current || this.ready()) return;
    this.lastCheck = Date.now();
    try {
      const res = await fetch(`/index.html?ct-check=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const latest = ENTRY.exec(await res.text())?.[1];
      if (latest && latest !== this.current) this.ready.set(true);
    } catch {
      /* offline or blocked: try again later */
    }
  }

  reload(): void {
    location.reload();
  }

  /**
   * An old page asked for a lazy file that the new deploy replaced. Reload once to pick up the new site;
   * if that already happened a moment ago, fall back to the visible prompt so we never loop.
   */
  recoverFromMissingChunk(): void {
    if (!this.enabled) return;
    let recent: boolean;
    try {
      recent = Date.now() - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) < 30_000;
      if (!recent) sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    } catch {
      recent = true; // cannot remember a reload, so never risk a loop
    }
    if (recent) {
      this.ready.set(true);
      this.dismissed.set(false);
    } else {
      location.reload();
    }
  }

  private runningEntry(): string {
    for (const s of Array.from(document.scripts)) {
      const src = s.getAttribute('src');
      if (src && /\bmain(?:-[\w]+)?\.js$/.test(src)) return src;
    }
    return '';
  }
}
