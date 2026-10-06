import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '@core/auth/auth-store';
import { SolveStore } from '@core/data/solve-store';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="top">
      <a class="brand" routerLink="/today">Cube<span>Trainer</span></a>
      <nav>
        <a routerLink="/today" routerLinkActive="active">Today</a>
        <a routerLink="/timer" routerLinkActive="active">Timer</a>
        <a routerLink="/trainer" routerLinkActive="active">Case trainer</a>
        <a routerLink="/drill" routerLinkActive="active">Drill</a>
        <a routerLink="/cross" routerLinkActive="active">Cross</a>
        <a routerLink="/algorithms" routerLinkActive="active">Algorithms</a>
        <a routerLink="/progress" routerLinkActive="active">Progress</a>
        <a routerLink="/history" routerLinkActive="active">History</a>
      </nav>
      <span class="badge" [attr.data-b]="store.backend()" [title]="badgeTitle()">{{
        badge()
      }}</span>
      @if (auth.ready()) {
        <span class="acct">
          @if (auth.user(); as u) {
            <a routerLink="/settings" class="who" [title]="u.email">{{ u.displayName }}</a>
            <button class="btn small" type="button" (click)="auth.logout()">Sign out</button>
          } @else {
            <a routerLink="/auth/login" class="btn small">Sign in</a>
            <a routerLink="/auth/register" class="btn small primary">Create account</a>
          }
        </span>
      }
    </header>
    @if (auth.ready() && !auth.signedIn() && !bannerHidden()) {
      <aside class="guest" role="note">
        <span
          >Your solves are saved on this device only. Create a free account so your history can
          follow you across devices.</span
        >
        <a routerLink="/auth/register" class="btn small primary">Create account</a>
        <button class="btn small" type="button" (click)="hideBanner()">Not now</button>
      </aside>
    }
    <main><router-outlet /></main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .top {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      position: sticky;
      top: 0;
      z-index: 5;
      flex-wrap: wrap;
    }
    .brand {
      font-weight: 700;
      font-size: 20px;
      color: var(--text);
      text-decoration: none;
    }
    .brand span {
      color: var(--accent);
    }
    nav {
      display: flex;
      gap: 4px;
      flex: 1;
      flex-wrap: wrap;
    }
    nav a {
      color: var(--muted);
      text-decoration: none;
      padding: 7px 14px;
      border-radius: 9px;
      font-size: 15px;
    }
    nav a:hover {
      color: var(--text);
    }
    nav a.active {
      background: var(--bg);
      color: var(--text);
    }
    .badge {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--muted);
    }
    .badge[data-b='api'] {
      color: #22c55e;
      border-color: #1f5f3a;
    }
    .acct {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .who {
      color: var(--text);
      text-decoration: none;
      font-size: 14px;
    }
    .guest {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      padding: 8px 20px;
      font-size: 14px;
      background: var(--panel);
      border-bottom: 1px solid var(--line);
    }
    .guest span {
      flex: 1;
      min-width: 220px;
    }
    main {
      max-width: 1040px;
      margin: 0 auto;
      padding: 18px 16px 60px;
      display: grid;
      gap: 16px;
    }
  `,
})
export class App {
  readonly store = inject(SolveStore);
  readonly auth = inject(AuthStore);
  readonly bannerHidden = signal(sessionStorage.getItem('ct.guestBanner') === '0');

  hideBanner(): void {
    this.bannerHidden.set(true);
    try {
      sessionStorage.setItem('ct.guestBanner', '0');
    } catch {
      /* storage blocked: banner just returns next visit */
    }
  }

  constructor() {
    // Drop focus after changing a dropdown / checkbox so Space goes to the timer, not to the control.
    document.addEventListener('change', (e) => (e.target as HTMLElement | null)?.blur?.());
  }

  badge = () =>
    ({ checking: 'Connecting…', api: 'Synced to server', local: 'Saved in this browser' })[
      this.store.backend()
    ];
  badgeTitle = () =>
    this.store.backend() === 'local'
      ? 'The API is not reachable, so solves are stored only in this browser (localStorage).'
      : 'Solves are mirrored to the PostgreSQL database through the .NET API.';
}
