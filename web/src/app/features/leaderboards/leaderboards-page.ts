import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';
import { AuthStore } from '@core/auth/auth-store';
import { CUBE_METHODS } from '@core/auth/auth.models';
import { countryOptions } from '@core/auth/countries';
import { toProblem } from '@core/auth/auth-utils';
import {
  BoardRow,
  LeaderboardApi,
  Metric,
  MyLeaderboards,
  Period,
} from '@core/data/leaderboard-api';
import { formatTime } from '@domain/stats';

const METRICS: { id: Metric; label: string }[] = [
  { id: 'single', label: 'Best single' },
  { id: 'ao5', label: 'Best Ao5' },
  { id: 'ao12', label: 'Best Ao12' },
];
const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: '30d', label: 'Last 30 days' },
];

@Component({
  selector: 'app-leaderboards-page',
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      align-items: end;
    }
    .controls .seg {
      grid-column: 1 / -1;
      justify-self: start;
    }
    .controls select {
      width: 100%;
    }
    label.f {
      display: grid;
      gap: 4px;
      font-size: 12px;
      color: var(--muted);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }
    th,
    td {
      text-align: left;
      padding: 8px 6px;
      border-bottom: 1px solid var(--line);
    }
    td.n,
    th.n {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    tr.me td {
      background: color-mix(in srgb, var(--accent) 14%, transparent);
    }
    .m-meta {
      display: none;
    }
    .mine {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 8px 14px;
      font-size: 14px;
    }
    /* Phones: each rank is a compact row — rank, who, result — with the small print underneath. */
    @media (max-width: 640px) {
      table,
      tbody {
        display: block;
      }
      thead {
        display: none;
      }
      tr {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) auto;
        grid-template-areas:
          'rank who res'
          'rank meta meta';
        align-items: center;
        column-gap: 12px;
        padding: 12px 10px;
        border-bottom: 1px solid var(--line-soft);
      }
      tr.me {
        background: color-mix(in srgb, var(--accent) 14%, transparent);
        border-radius: 12px;
      }
      td {
        display: block;
        border: 0;
        padding: 0;
        background: none !important;
      }
      td[data-a='rank'] {
        grid-area: rank;
        text-align: center;
        color: var(--muted);
        font-weight: 650;
      }
      td[data-a='who'] {
        grid-area: who;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      td[data-a='res'] {
        grid-area: res;
        font-size: 17px;
      }
      td.m-meta {
        display: block;
        grid-area: meta;
        color: var(--muted);
        font-size: 13px;
      }
      .c-country,
      .c-method,
      .c-date {
        display: none;
      }
    }
    .small {
      font-size: 13px;
    }
  `,
  template: `
    <section class="card">
      <h2 style="margin-top: 0">Leaderboards</h2>
      <p class="muted small">
        Only people who chose to join appear here, with their username, country and method. Results
        are reported by the app and not independently verified; times under 3 seconds are ignored.
        Rankings update every few minutes.
      </p>
      <div class="controls">
        <div class="seg" role="group" aria-label="Result">
          @for (m of metrics; track m.id) {
            <button class="btn" [class.on]="metric() === m.id" (click)="metric.set(m.id)">
              {{ m.label }}
            </button>
          }
        </div>
        <div class="seg" role="group" aria-label="Period">
          @for (p of periods; track p.id) {
            <button class="btn" [class.on]="period() === p.id" (click)="period.set(p.id)">
              {{ p.label }}
            </button>
          }
        </div>
        <label class="f">
          Country
          <select (change)="country.set($any($event.target).value)">
            <option value="">Worldwide</option>
            @for (c of countries; track c.code) {
              <option [value]="c.code" [selected]="country() === c.code">{{ c.name }}</option>
            }
          </select>
        </label>
        <label class="f">
          Method
          <select (change)="method.set($any($event.target).value)">
            <option value="">All methods</option>
            @for (m of methodOptions; track m.value) {
              <option [value]="m.value" [selected]="method() === m.value">{{ m.label }}</option>
            }
          </select>
        </label>
      </div>
    </section>

    <section class="card">
      @if (!auth.signedIn()) {
        <p>
          <a routerLink="/auth/login" [queryParams]="{ returnUrl: '/leaderboards' }">Sign in</a>
          to join the leaderboards and see where you stand.
        </p>
      } @else if (mine(); as m) {
        @if (!m.optedIn) {
          <p>You are not on the leaderboards. Joining shows your username, country and method.</p>
          @if (joinError(); as e) {
            <p class="banner error" role="alert">{{ e }}</p>
          }
          <button class="btn primary" type="button" (click)="join()" [disabled]="joining()">
            {{ joining() ? 'Joining…' : 'Join the leaderboards' }}
          </button>
        } @else {
          <div class="label">Your standing</div>
          @if (m.standings.length === 0) {
            <p class="muted">
              Nothing ranked yet. Full solves on the Timer count: you need at least 1 solve for a
              single, 5 for Ao5 and 12 for Ao12.
            </p>
          } @else {
            <div class="mine">
              @for (s of m.standings; track s.metric + s.period) {
                <span class="chip">
                  {{ label(s.metric) }} · {{ s.period === 'all' ? 'all time' : '30 days' }}:
                  <b>{{ fmt(s.valueMs) }}</b>
                  @if (s.rank) {
                    · #{{ s.rank }}
                  }
                </span>
              }
            </div>
          }
          <p class="muted small">
            You can leave any time in <a routerLink="/settings">Settings</a>; you disappear from the
            boards immediately.
          </p>
        }
      }
    </section>

    <section class="card">
      @if (error(); as e) {
        <p class="banner error" role="alert">{{ e }}</p>
      }
      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (rows().length === 0) {
        <p class="muted">No results here yet. Be the first!</p>
      } @else {
        <table>
          <thead>
            <tr>
              <th class="n">#</th>
              <th>Player</th>
              <th>Country</th>
              <th>Method</th>
              <th class="n">Result</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.handle) {
              <tr [class.me]="r.handle === auth.user()?.handle">
                <td class="n" data-a="rank">{{ r.rank }}</td>
                <td data-a="who">@{{ r.handle }}</td>
                <td class="c-country">{{ countryName(r.country) }}</td>
                <td class="c-method">{{ r.method ? methodLabel(r.method) : '-' }}</td>
                <td class="n" data-a="res">
                  <b>{{ fmt(r.valueMs) }}</b>
                </td>
                <td class="c-date">{{ r.achievedAtMs | date: 'mediumDate' }}</td>
                <td class="m-meta" data-a="meta">
                  {{ countryName(r.country) }} ·
                  {{ r.method ? methodLabel(r.method) : 'no method' }} ·
                  {{ r.achievedAtMs | date: 'mediumDate' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
})
export class LeaderboardsPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(LeaderboardApi);
  private readonly authApi = inject(AuthApi);

  protected readonly metrics = METRICS;
  protected readonly periods = PERIODS;
  protected readonly countries = countryOptions();
  protected readonly methodOptions = CUBE_METHODS;

  protected readonly metric = signal<Metric>('single');
  protected readonly period = signal<Period>('all');
  protected readonly country = signal('');
  protected readonly method = signal('');

  protected readonly rows = signal<BoardRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly mine = signal<MyLeaderboards | null>(null);
  protected readonly joining = signal(false);
  protected readonly joinError = signal<string | null>(null);
  private readonly names = new Map(this.countries.map((c) => [c.code, c.name]));
  private requestId = 0;

  protected readonly fmt = (ms: number) => formatTime(ms);
  protected readonly label = (m: Metric) => METRICS.find((x) => x.id === m)?.label ?? m;
  protected readonly countryName = (code: string) => this.names.get(code) ?? code;
  protected readonly methodLabel = (v: string) =>
    CUBE_METHODS.find((m) => m.value === v)?.label ?? v;
  protected readonly signedInUser = computed(() => this.auth.user()?.id ?? null);

  constructor() {
    effect(() => {
      const [metric, period, country, method] = [
        this.metric(),
        this.period(),
        this.country(),
        this.method(),
      ];
      untracked(() => void this.loadBoard(metric, period, country, method));
    });
    effect(() => {
      if (this.signedInUser()) untracked(() => void this.loadMine());
      else this.mine.set(null);
    });
  }

  private async loadBoard(metric: Metric, period: Period, country: string, method: string) {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await firstValueFrom(this.api.board(metric, period, country, method));
      if (id === this.requestId) this.rows.set(rows);
    } catch (err) {
      if (id === this.requestId) {
        this.rows.set([]);
        this.error.set(toProblem(err).message);
      }
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  private async loadMine() {
    try {
      this.mine.set(await firstValueFrom(this.api.mine()));
    } catch {
      this.mine.set(null);
    }
  }

  protected async join(): Promise<void> {
    this.joining.set(true);
    this.joinError.set(null);
    try {
      this.auth.setUser(
        await firstValueFrom(this.authApi.updateProfile({ leaderboardOptIn: true })),
      );
      await this.loadMine();
      await this.loadBoard(this.metric(), this.period(), this.country(), this.method());
    } catch (err) {
      this.joinError.set(toProblem(err).message);
    } finally {
      this.joining.set(false);
    }
  }
}
