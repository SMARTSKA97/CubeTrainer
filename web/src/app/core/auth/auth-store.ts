import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from './auth-api';
import { AuthResponse, UserProfile } from './auth.models';
import { toProblem } from './auth-utils';

const HINT_KEY = 'ct.session'; // "a refresh cookie probably exists": avoids a pointless refresh call for guests

type Status = 'unknown' | 'guest' | 'signedIn';

/**
 * Who is signed in. The access token lives in memory only (never in storage); the long-lived refresh token is
 * an HttpOnly cookie the browser JavaScript cannot read, so an XSS bug cannot steal a long-lived session.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);

  private accessToken: string | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<boolean> | null = null;

  private readonly _user = signal<UserProfile | null>(null);
  private readonly _status = signal<Status>('unknown');

  readonly user = this._user.asReadonly();
  readonly status = this._status.asReadonly();
  readonly signedIn = computed(() => this._status() === 'signedIn');
  readonly ready = computed(() => this._status() !== 'unknown');

  private initPromise: Promise<void> | null = null;

  /** Silently resumes a previous session if the cookie is still valid. Safe to call many times (route guards do). */
  init(): Promise<void> {
    this.initPromise ??= this.resume();
    return this.initPromise;
  }

  private async resume(): Promise<void> {
    if (!hasHint()) {
      this._status.set('guest');
      return;
    }
    await this.refresh();
    if (this._status() === 'unknown') this._status.set('guest');
  }

  token(): string | null {
    return this.accessToken;
  }

  async login(email: string, password: string): Promise<void> {
    this.accept(await firstValueFrom(this.api.login(email, password)));
  }

  /** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
  refresh(): Promise<boolean> {
    this.inFlight ??= this.doRefresh().finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.logout());
    } catch {
      /* the cookie is cleared server-side when reachable; locally we sign out regardless */
    }
    this.clear();
    await this.router.navigateByUrl('/today');
  }

  /** Server told us the session is gone (password changed elsewhere, account deleted...). */
  expire(): void {
    this.clear();
  }

  /** Takes over a session the API just created (social sign-up finished in the browser). */
  acceptSession(res: AuthResponse): void {
    this.accept(res);
  }

  setUser(user: UserProfile): void {
    this._user.set(user);
  }

  private async doRefresh(): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.accept(await firstValueFrom(this.api.refresh()));
        return true;
      } catch (err) {
        const problem = toProblem(err);
        if (problem.code === 'refresh_in_progress') {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); // another tab rotated the cookie a moment ago
          continue;
        }
        if (problem.status === 0) return false; // offline: keep the user as they are, try again later
        this.clear();
        return false;
      }
    }
    return false;
  }

  private accept(res: AuthResponse): void {
    this.accessToken = res.accessToken;
    this._user.set(res.user);
    this._status.set('signedIn');
    setHint(true);
    this.scheduleRefresh(res.expiresAt);
  }

  private clear(): void {
    this.accessToken = null;
    clearTimeout(this.refreshTimer);
    this._user.set(null);
    this._status.set('guest');
    setHint(false);
  }

  private scheduleRefresh(expiresAt: string): void {
    clearTimeout(this.refreshTimer);
    const ms = new Date(expiresAt).getTime() - Date.now() - 60_000; // one minute early
    this.refreshTimer = setTimeout(() => void this.refresh(), Math.max(ms, 5_000));
  }
}

function hasHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function setHint(on: boolean): void {
  try {
    if (on) localStorage.setItem(HINT_KEY, '1');
    else localStorage.removeItem(HINT_KEY);
  } catch {
    /* private mode: sign-in still works for this tab */
  }
}
