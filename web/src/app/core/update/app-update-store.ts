import { Injectable, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { updatesRepo } from '@core/config';
import { isNative } from '@core/native';
import {
  AppUpdate,
  GithubRelease,
  compareVersions,
  pickUpdate,
  validRepo,
} from '../../domain/app-update';
import { AppUpdater } from './app-updater.plugin';

export type UpdateState =
  'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'needs-permission' | 'error';

const LAST_CHECK = 'ct.updateCheckedAt';
const LAST_FOUND = 'ct.updateFound';
/** Opening the app checks GitHub, but reopening within this window reuses the last answer. */
const RECHECK_AFTER = 10 * 60 * 1000;

/**
 * In-app updates for the sideloaded Android app. Looks at the GitHub releases of the configured repository,
 * shows the changelog, downloads the APK and hands it to Android's installer. Android only accepts the update
 * when it is signed with the same key as the installed app, so a wrong or tampered file simply fails to install.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateStore {
  readonly enabled = isNative() && validRepo(updatesRepo());
  readonly state = signal<UpdateState>('idle');
  readonly installed = signal('');
  readonly update = signal<AppUpdate | null>(null);
  readonly received = signal(0);
  readonly error = signal<string | null>(null);
  /** Version the person tapped "Later" on in this session; it is not offered again until they reopen the app. */
  readonly dismissedVersion = signal<string | null>(null);

  /** 0..1, or null while the size is unknown. */
  readonly progress = computed(() => {
    const total = this.update()?.size ?? 0;
    return total > 0 ? Math.min(1, this.received() / total) : null;
  });
  /** A newer version is waiting (drives the dot on More and Updates). */
  readonly available = computed(() => this.update() !== null && this.state() !== 'uptodate');
  /** Show the "update ready" sheet: there is a newer version and the person has not said "Later" to it. */
  readonly prompt = computed(() => {
    const u = this.update();
    return u !== null && this.state() !== 'uptodate' && this.dismissedVersion() !== u.version;
  });

  /** Called when the app opens and again when it comes back to the foreground. Reopening within a few minutes reuses the last answer so GitHub's anonymous rate limit is never an issue. */
  async autoCheck(): Promise<void> {
    if (!this.enabled) return;
    try {
      const last = Number((await Preferences.get({ key: LAST_CHECK })).value ?? 0);
      if (Date.now() - last < RECHECK_AFTER) {
        await this.loadInstalled();
        await this.restoreFound();
        return;
      }
    } catch {
      /* check anyway */
    }
    await this.check(true);
  }

  async check(quiet = false): Promise<void> {
    if (!this.enabled || this.state() === 'checking' || this.state() === 'downloading') return;
    this.state.set('checking');
    this.error.set(null);
    try {
      await this.loadInstalled();
      const res = await fetch(
        `https://api.github.com/repos/${updatesRepo()}/releases?per_page=20`,
        {
          headers: { Accept: 'application/vnd.github+json' },
        },
      );
      if (!res.ok)
        throw new Error(
          res.status === 403
            ? 'GitHub is limiting requests right now. Try again in a while.'
            : `GitHub answered ${res.status}.`,
        );
      const found = pickUpdate((await res.json()) as GithubRelease[], this.installed());
      this.update.set(found);
      this.state.set(found ? 'available' : 'uptodate');
      await Preferences.set({ key: LAST_CHECK, value: String(Date.now()) });
      if (found) await Preferences.set({ key: LAST_FOUND, value: JSON.stringify(found) });
      else await Preferences.remove({ key: LAST_FOUND });
    } catch (e) {
      this.state.set('error');
      if (!quiet) this.error.set(e instanceof Error ? e.message : 'Could not check for updates.');
      else this.state.set('idle');
    }
  }

  later(): void {
    this.dismissedVersion.set(this.update()?.version ?? null);
  }

  async install(): Promise<void> {
    const u = this.update();
    if (!u || this.state() === 'downloading') return;
    this.error.set(null);
    try {
      if (!(await AppUpdater.canInstall()).allowed) {
        this.state.set('needs-permission');
        await AppUpdater.openInstallSettings();
        return;
      }
      this.received.set(0);
      this.state.set('downloading');
      const sub = await AppUpdater.addListener('progress', (p) => this.received.set(p.received));
      try {
        await AppUpdater.downloadAndInstall({ url: u.url, fileName: u.fileName });
      } finally {
        await sub.remove();
      }
      // The system installer is on screen now; if the user backs out we are simply still on "available".
      this.state.set('available');
    } catch (e) {
      this.state.set('available');
      this.error.set(e instanceof Error ? e.message : 'The update could not be installed.');
    }
  }

  /** Quiet launches within a day still remind the user about an update found earlier (unless they installed it meanwhile). */
  private async restoreFound(): Promise<void> {
    try {
      const raw = (await Preferences.get({ key: LAST_FOUND })).value;
      const u = raw ? (JSON.parse(raw) as AppUpdate) : null;
      if (u && compareVersions(u.version, this.installed()) > 0) {
        this.update.set(u);
        if (this.state() === 'idle' || this.state() === 'error') this.state.set('available');
      }
    } catch {
      /* ignore a corrupt cache */
    }
  }

  private async loadInstalled(): Promise<void> {
    if (this.installed()) return;
    const { App } = await import('@capacitor/app');
    this.installed.set((await App.getInfo()).version);
  }
}
