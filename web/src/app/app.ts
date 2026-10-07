import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthStore } from '@core/auth/auth-store';
import { SolveStore } from '@core/data/solve-store';
import { TourService } from '@core/tour/tour-service';
import { AppUpdateStore } from '@core/update/app-update-store';
import { WebUpdateStore } from '@core/update/web-update-store';
import { AppTour } from '@shared/app-tour';
import { UpdatePrompt } from '@shared/update-prompt';

interface NavItem {
  path: string;
  label: string;
  /** SVG path data on a 24x24 grid, drawn as a 1.8px stroke. */
  icon: string;
  /** Matches the data-tour attribute the walkthrough looks for. */
  tour: string;
}

const ICONS = {
  today:
    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 16l2 2 4-4',
  timer: 'M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  trainer: 'M12 2l9 5v10l-9 5-9-5V7l9-5zM12 12l9-5M12 12v10M12 12L3 7',
  drill: 'M13 2L3 14h8l-1 8 10-12h-8l1-8z',
  cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  algorithms: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  progress: 'M3 3v18h18M7 14l4-4 3 3 5-6',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  leaderboards:
    'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  update: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  tour: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
};

const item = (path: string, label: string, icon: keyof typeof ICONS, tour = ''): NavItem => ({
  path,
  label,
  icon: ICONS[icon],
  tour,
});

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppTour, UpdatePrompt],
  template: `
    <header class="top">
      <a class="brand" routerLink="/today" aria-label="CubeTrainer home">
        <svg class="mark" viewBox="0 0 18 18" aria-hidden="true">
          <rect x="0" y="0" width="5" height="5" rx="1.2" fill="#f87171" />
          <rect x="6.5" y="0" width="5" height="5" rx="1.2" fill="#fbbf24" />
          <rect x="13" y="0" width="5" height="5" rx="1.2" fill="#34d27b" />
          <rect x="0" y="6.5" width="5" height="5" rx="1.2" fill="#60a5fa" />
          <rect x="6.5" y="6.5" width="5" height="5" rx="1.2" fill="#f1f5f9" />
          <rect x="13" y="6.5" width="5" height="5" rx="1.2" fill="#fb923c" />
          <rect x="0" y="13" width="5" height="5" rx="1.2" fill="#34d27b" />
          <rect x="6.5" y="13" width="5" height="5" rx="1.2" fill="#f87171" />
          <rect x="13" y="13" width="5" height="5" rx="1.2" fill="#fbbf24" />
        </svg>
        <span class="word">Cube<span>Trainer</span></span>
      </a>
      <nav class="wide" aria-label="Main" data-tour="more">
        @for (n of allNav(); track n.path) {
          <a [routerLink]="n.path" routerLinkActive="active" [attr.data-tour]="n.tour || null"
            >{{ n.label }}
            @if (n.path === '/update' && updates.available()) {
              <i class="pip" aria-label="new version"></i>
            }
          </a>
        }
      </nav>
      <span class="spacer"></span>
      <span class="badge" data-tour="sync" [attr.data-b]="store.sync()" [title]="badgeTitle()">
        <i class="dot"></i><span class="txt">{{ badge() }}</span>
      </span>
      @if (auth.ready()) {
        <span class="acct" data-tour="account">
          @if (auth.user(); as u) {
            <a routerLink="/settings" class="who" [title]="u.email">
              <span class="av" aria-hidden="true">{{ initial() }}</span>
              <span class="nm">{{ u.displayName }}</span>
            </a>
            <button class="btn small out" type="button" (click)="auth.logout()">Sign out</button>
          } @else {
            <a routerLink="/auth/login" class="btn small">Sign in</a>
            <a routerLink="/auth/register" class="btn small primary reg">Create account</a>
          }
        </span>
      }
    </header>

    <div class="notices">
      @if (auth.ready() && !auth.signedIn() && !bannerHidden()) {
        <aside class="notice" role="note">
          <span
            >Your solves are saved on this device only. Create a free account to keep your history
            on every device.</span
          >
          <span class="acts">
            <a routerLink="/auth/register" class="btn small primary">Create account</a>
            <button class="btn small" type="button" (click)="hideBanner()">Not now</button>
          </span>
        </aside>
      }
      @if (store.guestImport(); as g) {
        <aside class="notice" role="note">
          <span
            >This device has {{ g.count }} solve{{ g.count === 1 ? '' : 's' }} recorded as a guest.
            Add {{ g.count === 1 ? 'it' : 'them' }} to your account?</span
          >
          <span class="acts">
            <button class="btn small primary" type="button" (click)="store.acceptGuestImport()">
              Add to my account
            </button>
            <button class="btn small" type="button" (click)="store.dismissGuestImport()">
              Keep separate
            </button>
          </span>
        </aside>
      }
    </div>

    <main><router-outlet /></main>
    <footer class="legal">
      <a routerLink="/legal/terms">Terms</a>
      <a routerLink="/legal/privacy">Privacy</a>
      <button type="button" class="tourlink" (click)="tour.start()">Take the tour</button>
    </footer>

    <!-- Phones and tablets: four big thumb-reachable tabs; everything else lives under More. -->
    <nav class="tabs" aria-label="Main">
      @for (n of tabs; track n.path) {
        <a
          [routerLink]="n.path"
          routerLinkActive="active"
          [attr.data-tour]="n.tour"
          (click)="moreOpen.set(false)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="n.icon" /></svg>
          <span>{{ n.label }}</span>
        </a>
      }
      <button
        type="button"
        data-tour="more"
        [class.active]="moreOpen() || moreActive()"
        [attr.aria-expanded]="moreOpen()"
        aria-controls="more-sheet"
        (click)="moreOpen.set(!moreOpen())"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.more" /></svg>
        <span>More</span>
        @if (updates.available()) {
          <i class="pip" aria-label="new version"></i>
        }
      </button>
    </nav>

    @if (moreOpen()) {
      <div class="scrim" (click)="moreOpen.set(false)" aria-hidden="true"></div>
      <section class="sheet" id="more-sheet" role="dialog" aria-label="More">
        <span class="grab" aria-hidden="true"></span>
        <div class="grid">
          @for (n of moreNav(); track n.path) {
            <a [routerLink]="n.path" routerLinkActive="active" (click)="moreOpen.set(false)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="n.icon" /></svg>
              <span>{{ n.label }}</span>
              @if (n.path === '/update' && updates.available()) {
                <i class="pip" aria-label="new version"></i>
              }
            </a>
          }
          <button type="button" class="tile" (click)="moreOpen.set(false); tour.start()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.tour" /></svg>
            <span>Take the tour</span>
          </button>
        </div>
        @if (auth.ready()) {
          <div class="who-row">
            @if (auth.user(); as u) {
              <span class="who-t"
                ><b>{{ u.displayName }}</b
                ><small>{{ u.email }}</small></span
              >
              <button class="btn small" type="button" (click)="moreOpen.set(false); auth.logout()">
                Sign out
              </button>
            } @else {
              <a routerLink="/auth/login" class="btn" (click)="moreOpen.set(false)">Sign in</a>
              <a routerLink="/auth/register" class="btn primary" (click)="moreOpen.set(false)"
                >Create account</a
              >
            }
          </div>
        }
        <div class="sheet-legal">
          <a routerLink="/legal/terms" (click)="moreOpen.set(false)">Terms</a>
          <a routerLink="/legal/privacy" (click)="moreOpen.set(false)">Privacy</a>
        </div>
      </section>
    }

    <app-update-prompt />
    <app-tour />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'moreOpen.set(false)' },
  styles: `
    :host {
      display: block;
    }
    /* ---------- top bar ---------- */
    .top {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 64px;
      padding: calc(12px + var(--sat)) calc(20px + var(--sar)) 12px calc(20px + var(--sal));
      border-bottom: 1px solid var(--line-soft);
      background: rgba(12, 14, 19, 0.82);
      -webkit-backdrop-filter: blur(16px) saturate(1.3);
      backdrop-filter: blur(16px) saturate(1.3);
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--text);
      text-decoration: none;
      flex: none;
    }
    .mark {
      width: 22px;
      height: 22px;
      transition: transform 0.25s;
    }
    .brand:hover .mark {
      transform: rotate(8deg) scale(1.06);
    }
    .word {
      font-weight: 700;
      font-size: 18px;
      letter-spacing: -0.02em;
    }
    .word span {
      color: var(--accent);
    }
    .spacer {
      flex: 1;
    }
    nav.wide {
      display: none;
      gap: 4px;
      margin-left: 12px;
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
    }
    nav.wide::-webkit-scrollbar {
      display: none;
    }
    nav.wide a {
      position: relative;
      color: var(--muted);
      text-decoration: none;
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 14.5px;
      font-weight: 500;
      white-space: nowrap;
      transition:
        color 0.15s,
        background 0.15s;
    }
    nav.wide a:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.04);
    }
    nav.wide a.active {
      background: var(--accent-soft);
      color: var(--text);
    }
    .pip {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 0 2px var(--bg);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      padding: 5px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--muted);
      white-space: nowrap;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }
    .badge[data-b='offline'],
    .badge[data-b='error'] {
      color: var(--warn);
      border-color: rgba(245, 165, 36, 0.35);
    }
    .badge[data-b='synced'] {
      color: var(--good);
      border-color: rgba(52, 210, 123, 0.3);
    }
    .badge[data-b='syncing'] .dot {
      animation: pulse 1s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.25;
      }
    }
    .acct .btn {
      white-space: nowrap;
    }
    .acct {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .who {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--text);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
    }
    .av {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 14px;
      color: #0a0d16;
      background: linear-gradient(135deg, #8aa8ff, var(--accent-2));
    }
    .nm {
      max-width: 14ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ---------- notices ---------- */
    .notices {
      max-width: 1040px;
      margin: 0 auto;
      padding: 0 calc(20px + var(--sar)) 0 calc(20px + var(--sal));
      display: grid;
      gap: 12px;
    }
    .notices:not(:empty) {
      padding-top: 20px;
    }
    .notice {
      display: flex;
      gap: 12px 20px;
      align-items: center;
      flex-wrap: wrap;
      padding: 14px 16px 14px 20px;
      font-size: 14px;
      color: #c3c9d8;
      background: var(--accent-soft);
      border: 1px solid rgba(124, 156, 255, 0.22);
      border-radius: var(--radius);
    }
    .notice > span:first-child {
      flex: 1 1 260px;
      min-width: 0;
    }
    .notice .acts {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    /* ---------- page ---------- */
    main {
      max-width: 1040px;
      margin: 0 auto;
      padding: 28px calc(20px + var(--sar)) 48px calc(20px + var(--sal));
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--gap);
    }
    main > * {
      min-width: 0;
    }
    .legal {
      display: flex;
      justify-content: center;
      gap: 20px;
      font-size: 13px;
      color: var(--muted);
      padding: 0 16px 40px;
    }
    .legal a,
    .tourlink {
      color: var(--muted);
      text-decoration: none;
    }
    .legal a:hover,
    .tourlink:hover {
      color: var(--text);
    }
    .tourlink {
      background: none;
      border: 0;
      font: inherit;
      padding: 0;
      cursor: pointer;
    }

    /* ---------- bottom tabs (hidden on desktop) ---------- */
    .tabs {
      display: none;
    }

    /* ---------- desktop ---------- */
    @media (min-width: 1000px) {
      nav.wide {
        display: flex;
      }
    }
    /* Mid-size laptops: trim the bar so nothing wraps or gets cut off. */
    @media (min-width: 1000px) and (max-width: 1399px) {
      .badge .txt {
        display: none;
      }
      .badge {
        padding: 6px 9px;
      }
      nav.wide {
        gap: 0;
        margin-left: 4px;
      }
      nav.wide a {
        padding: 8px 10px;
      }
    }
    /* ---------- phones and tablets ---------- */
    @media (max-width: 999px) {
      main {
        padding-bottom: calc(var(--tabbar-h) + var(--sab) + 32px);
      }
      .legal {
        display: none;
      }
      .out,
      .reg,
      .nm {
        display: none;
      }
      .tabs {
        display: flex;
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 30;
        padding: 8px calc(10px + var(--sar)) calc(8px + var(--sab)) calc(10px + var(--sal));
        background: rgba(16, 19, 26, 0.92);
        -webkit-backdrop-filter: blur(18px) saturate(1.4);
        backdrop-filter: blur(18px) saturate(1.4);
        border-top: 1px solid var(--line-soft);
        gap: 6px;
      }
      .tabs a,
      .tabs button {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        min-height: 52px;
        padding: 6px 2px;
        border: 0;
        border-radius: 16px;
        background: none;
        color: var(--muted);
        font: inherit;
        font-size: 11.5px;
        font-weight: 550;
        text-decoration: none;
        cursor: pointer;
        position: relative;
        transition:
          color 0.15s,
          background 0.15s;
      }
      .tabs .pip {
        top: 8px;
        right: calc(50% - 20px);
      }
      .tabs svg {
        width: 23px;
        height: 23px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .tabs .active {
        color: var(--text);
        background: var(--accent-soft);
      }
      .tabs .active svg {
        color: var(--accent);
      }
    }
    @media (max-width: 480px) {
      .top {
        gap: 12px;
        min-height: 58px;
        padding-left: calc(16px + var(--sal));
        padding-right: calc(16px + var(--sar));
      }
      .badge {
        padding: 6px 9px;
      }
      .badge .txt {
        display: none;
      }
      .notices {
        padding-left: calc(16px + var(--sal));
        padding-right: calc(16px + var(--sar));
      }
      main {
        padding: 20px calc(16px + var(--sar)) 40px calc(16px + var(--sal));
      }
    }
    /* Landscape phones: keep the bar slim so the timer has room. */
    @media (max-height: 460px) and (max-width: 999px) {
      .top {
        position: static;
        min-height: 0;
        padding-top: calc(6px + var(--sat));
        padding-bottom: 6px;
      }
      .notices {
        display: none;
      }
      .tabs {
        padding-top: 4px;
        padding-bottom: calc(4px + var(--sab));
      }
      .tabs a,
      .tabs button {
        flex-direction: row;
        min-height: 40px;
        font-size: 12.5px;
      }
      .tabs svg {
        width: 20px;
        height: 20px;
      }
      main {
        padding-top: 16px;
        padding-bottom: calc(60px + var(--sab));
      }
    }

    /* ---------- "More" sheet ---------- */
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 40;
      background: rgba(5, 7, 12, 0.62);
      animation: fade 0.18s both;
    }
    .sheet {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 50;
      max-width: 560px;
      margin: 0 auto;
      max-height: 84dvh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 12px calc(20px + var(--sar)) calc(24px + var(--sab)) calc(20px + var(--sal));
      background: var(--panel);
      border: 1px solid var(--line);
      border-bottom: 0;
      border-radius: 26px 26px 0 0;
      box-shadow: 0 -24px 60px -12px rgba(0, 0, 0, 0.8);
      animation: slide 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .grab {
      display: block;
      width: 40px;
      height: 4px;
      border-radius: 4px;
      background: var(--line);
      margin: 0 auto;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .grid a,
    .grid .tile {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 88px;
      padding: 14px 8px;
      border-radius: 16px;
      border: 1px solid var(--line-soft);
      background: var(--bg);
      color: var(--text);
      font: inherit;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      text-align: center;
      cursor: pointer;
    }
    .grid a.active {
      border-color: rgba(124, 156, 255, 0.5);
      background: var(--accent-soft);
    }
    .grid svg {
      width: 24px;
      height: 24px;
      fill: none;
      stroke: var(--accent);
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .grid .pip {
      top: 10px;
      right: 14px;
    }
    .who-row {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      padding-top: 20px;
      border-top: 1px solid var(--line-soft);
    }
    .who-t {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .who-t small {
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sheet-legal {
      display: flex;
      justify-content: center;
      gap: 20px;
      font-size: 13px;
    }
    .sheet-legal a {
      color: var(--muted);
      text-decoration: none;
    }
    @media (min-width: 1000px) {
      .scrim,
      .sheet {
        display: none;
      }
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @keyframes slide {
      from {
        transform: translateY(40px);
        opacity: 0;
      }
    }
  `,
})
export class App {
  readonly store = inject(SolveStore);
  readonly auth = inject(AuthStore);
  readonly updates = inject(AppUpdateStore);
  readonly tour = inject(TourService);
  private readonly webUpdate = inject(WebUpdateStore);
  private readonly router = inject(Router);
  readonly bannerHidden = signal(sessionStorage.getItem('ct.guestBanner') === '0');
  readonly moreOpen = signal(false);
  readonly icons = ICONS;

  /** The four tabs that stay one thumb-tap away. */
  readonly tabs: NavItem[] = [
    item('/today', 'Today', 'today', 'today'),
    item('/timer', 'Timer', 'timer', 'timer'),
    item('/trainer', 'Trainer', 'trainer', 'trainer'),
    item('/progress', 'Progress', 'progress', 'progress'),
  ];
  private readonly rest: NavItem[] = [
    item('/drill', 'Drill', 'drill'),
    item('/cross', 'Cross', 'cross'),
    item('/algorithms', 'Algorithms', 'algorithms'),
    item('/history', 'History', 'history'),
    item('/leaderboards', 'Leaderboards', 'leaderboards'),
  ];

  readonly moreNav = computed<NavItem[]>(() => [
    ...this.rest,
    ...(this.updates.enabled ? [item('/update', 'Updates', 'update')] : []),
    item('/settings', 'Settings', 'settings'),
  ]);
  /** Desktop top bar: the same pages, in the long form. */
  readonly allNav = computed<NavItem[]>(() => [
    this.tabs[0],
    this.tabs[1],
    { ...this.tabs[2], label: 'Case trainer' },
    this.rest[0],
    this.rest[1],
    this.rest[2],
    this.tabs[3],
    this.rest[3],
    this.rest[4],
    ...(this.updates.enabled ? [item('/update', 'Updates', 'update')] : []),
  ]);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** Highlight "More" while the current page is one of the pages that live inside it. */
  readonly moreActive = computed(() => {
    const u = this.url().split('?')[0];
    return this.moreNav().some((n) => u === n.path || u.startsWith(n.path + '/'));
  });
  readonly initial = computed(() =>
    (this.auth.user()?.displayName ?? '?').trim().charAt(0).toUpperCase(),
  );

  hideBanner(): void {
    this.bannerHidden.set(true);
    try {
      sessionStorage.setItem('ct.guestBanner', '0');
    } catch {
      /* storage blocked: banner just returns next visit */
    }
  }

  constructor() {
    // A new version is looked for every time the app opens, and again whenever it comes back to the foreground.
    void this.updates.autoCheck();
    this.webUpdate.start();
    if (this.updates.enabled) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.updates.autoCheck();
      });
    }
    // First launch: offer the tour once, after the page has settled and any update sheet is out of the way.
    setTimeout(() => {
      if (!this.updates.prompt()) this.tour.maybeAutoStart();
    }, 1500);
    // Drop focus after changing a dropdown / checkbox so Space goes to the timer, not to the control.
    document.addEventListener('change', (e) => (e.target as HTMLElement | null)?.blur?.());
  }

  badge = () => {
    const pending = this.store.pending();
    switch (this.store.sync()) {
      case 'guest':
        return 'Saved on this device';
      case 'syncing':
        return 'Syncing…';
      case 'synced':
        return 'Synced';
      case 'offline':
        return pending ? `Offline · ${pending} waiting` : 'Offline';
      default:
        return pending ? `Sync problem · ${pending} waiting` : 'Sync problem';
    }
  };
  badgeTitle = () =>
    ({
      guest:
        'Guest mode: solves are stored only in this browser. Create an account to back them up and use other devices.',
      syncing: 'Sending your changes and fetching changes from your other devices.',
      synced: 'Your solves are backed up to your account and up to date.',
      offline: 'No connection. Everything keeps working and uploads when you are back online.',
      error:
        'The server rejected or could not process a sync request. It will retry automatically.',
    })[this.store.sync()];
}
