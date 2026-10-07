import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { AlgService } from '@core/data/alg-service';
import { RetryService } from '@core/data/retry';
import { SolveStore } from '@core/data/solve-store';
import { SolveFilterState } from '@core/data/solve-filter-state';
import { SolveFilterBar } from '@shared/solve-filter-bar';
import {
  MISTAKES,
  Solve,
  averageOf,
  effective,
  formatSolve,
  formatTime,
  sessionStats,
} from '@domain/stats';

type Filter = 'all' | 'random' | 'case';

@Component({
  selector: 'app-history-page',
  standalone: true,
  imports: [SolveFilterBar],
  template: `
    <section class="card">
      <app-solve-filter-bar />
    </section>

    <section class="card">
      <div class="row">
        <div class="seg">
          @for (f of filters; track f.id) {
            <button class="btn" [class.on]="filter() === f.id" (click)="filter.set(f.id)">
              {{ f.label }}
            </button>
          }
        </div>
      </div>
      <div class="tools">
        <button class="btn" (click)="exportJson()">Export JSON</button>
        <label class="btn" title="Restore solves from an exported JSON file"
          >Import JSON
          <input
            type="file"
            accept="application/json,.json"
            hidden
            (change)="importJson($any($event.target))"
          />
        </label>
        <button class="btn" (click)="exportCsv()">Export CSV</button>
        <button class="btn danger" (click)="clearAll()">
          Clear {{ filter() === 'all' ? 'all' : filter() }}…
        </button>
      </div>
    </section>

    @if (list().length === 0) {
      <div class="card muted">
        No solves yet. Do a few on the Timer or Trainer page and they will show up here.
      </div>
    } @else {
      <section class="card">
        <div class="label">
          Progress — last {{ chart().points.length }} solves (dots) and Ao5 (line)
        </div>
        <svg
          [attr.viewBox]="'0 0 ' + W + ' ' + H"
          class="chart"
          role="img"
          aria-label="Solve times"
        >
          @for (g of chart().grid; track g.y) {
            <line [attr.x1]="PL" [attr.x2]="W - 8" [attr.y1]="g.y" [attr.y2]="g.y" class="grid" />
            <text [attr.x]="PL - 6" [attr.y]="g.y + 4" text-anchor="end" class="axis">
              {{ g.label }}
            </text>
          }
          @if (chart().avgPath) {
            <path [attr.d]="chart().avgPath" class="avg" />
          }
          @for (p of chart().points; track p.id) {
            <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.2" [class.dnf]="p.dnf" class="dot" />
          }
        </svg>
        <div class="stats">
          <div>
            <span>Solves</span><b>{{ stats().count }}</b>
          </div>
          <div>
            <span>Best</span><b>{{ f(stats().best) }}</b>
          </div>
          <div>
            <span>Mean</span><b>{{ f(stats().mean) }}</b>
          </div>
          <div>
            <span>Best Ao5</span><b>{{ f(stats().bestAo5) }}</b>
          </div>
          <div>
            <span>Best Ao12</span><b>{{ f(stats().bestAo12) }}</b>
          </div>
        </div>
      </section>

      <section class="card table-card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>When</th>
              <th>Mode</th>
              <th>Scramble</th>
              <th>This scramble</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.s.id) {
              <tr>
                <td class="muted">{{ r.n }}</td>
                <td class="time" [class.dnf]="r.s.penalty === 'dnf'">{{ formatSolve(r.s) }}</td>
                <td class="muted">{{ when(r.s.at) }}</td>
                <td>
                  @if (r.s.mode === 'case') {
                    <span class="tag">{{ caseName(r.s.caseId) }}</span>
                  } @else {
                    <span class="tag rnd"
                      >random
                      @if (r.s.stage) {
                        · {{ r.s.stage }}
                      }
                    </span>
                  }
                  @for (t of r.s.tags ?? []; track t) {
                    <span class="tag bad">{{ tagLabel(t) }}</span>
                  }
                </td>
                <td class="scr">
                  <code>{{ r.s.scramble }}</code>
                </td>
                <td class="cmp">
                  @if (r.same > 1) {
                    <span [class.good]="r.delta !== null && r.delta < 0">
                      attempt {{ r.attempt }}/{{ r.same }}
                      @if (r.delta !== null) {
                        · {{ r.delta < 0 ? '−' : '+' }}{{ abs(r.delta) }} vs first
                      }
                    </span>
                  } @else {
                    <span class="muted">single</span>
                  }
                </td>
                <td class="act">
                  <button class="btn small primary" (click)="retry(r.s)">Retry</button>
                  <button
                    class="btn small"
                    (click)="store.setPenalty(r.s.id, r.s.penalty === 'plus2' ? 'none' : 'plus2')"
                    [class.on]="r.s.penalty === 'plus2'"
                  >
                    +2
                  </button>
                  <button
                    class="btn small"
                    (click)="store.setPenalty(r.s.id, r.s.penalty === 'dnf' ? 'none' : 'dnf')"
                    [class.on]="r.s.penalty === 'dnf'"
                  >
                    DNF
                  </button>
                  <button class="btn small danger" (click)="store.remove(r.s.id)">✕</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (list().length > shown()) {
          <div class="more">
            <button class="btn" (click)="shown.set(shown() + 100)">Show more</button>
          </div>
        }
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .chart {
      width: 100%;
      height: auto;
      margin: 8px 0 12px;
    }
    .grid {
      stroke: var(--line);
      stroke-width: 1;
    }
    .axis {
      fill: var(--muted);
      font-size: 11px;
    }
    .dot {
      fill: var(--accent);
      opacity: 0.85;
    }
    .dot.dnf {
      fill: #ef4444;
    }
    .avg {
      fill: none;
      stroke: #22c55e;
      stroke-width: 2;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 10px;
    }
    .stats div {
      background: var(--bg);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .stats span {
      display: block;
      font-size: 12px;
      color: var(--muted);
    }
    .stats b {
      font-size: 20px;
      font-variant-numeric: tabular-nums;
    }
    .table-card {
      padding: 0;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th,
    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: middle;
    }
    th {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    td.time {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    td.time.dnf {
      color: #ef4444;
    }
    td.scr {
      max-width: 340px;
    }
    td.scr code {
      font-size: 12px;
      word-break: break-word;
    }
    td.cmp {
      font-size: 13px;
      white-space: nowrap;
    }
    td.cmp .good {
      color: #22c55e;
    }
    td.act {
      white-space: nowrap;
      display: flex;
      gap: 4px;
    }
    .tag {
      background: var(--bg);
      border-radius: 6px;
      padding: 2px 8px;
      font-size: 12px;
    }
    .tag.rnd {
      color: var(--muted);
    }
    .tag.bad {
      color: #f59e0b;
      margin-left: 4px;
    }
    .more {
      padding: 12px;
      text-align: center;
    }
  `,
})
export class HistoryPage {
  readonly store = inject(SolveStore);
  private readonly view = inject(SolveFilterState);
  private readonly algs = inject(AlgService);
  private readonly retryService = inject(RetryService);
  private readonly router = inject(Router);

  readonly filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'random', label: 'Random scrambles' },
    { id: 'case', label: 'Case trainer' },
  ];
  readonly filter = signal<Filter>('all');
  readonly shown = signal(100);

  readonly W = 760;
  readonly H = 220;
  readonly PL = 44;

  readonly formatSolve = formatSolve;
  f = (v: number | null | undefined) => (v === null || v === undefined ? '-' : formatTime(v));
  abs = (n: number) => formatTime(Math.abs(n));

  /** oldest -> newest */
  readonly list = computed(() =>
    this.view.solves().filter((s) => this.filter() === 'all' || s.mode === this.filter()),
  );
  readonly stats = computed(() => sessionStats(this.list()));

  /** newest first, each row annotated with how it compares to earlier attempts on the same scramble */
  readonly rows = computed(() => {
    const all = this.list();
    const byScramble = new Map<string, Solve[]>();
    for (const s of all) byScramble.set(s.scramble, [...(byScramble.get(s.scramble) ?? []), s]);
    return all
      .map((s, i) => {
        const group = byScramble.get(s.scramble)!;
        const attempt = group.findIndex((g) => g.id === s.id) + 1;
        const first = effective(group[0]);
        const mine = effective(s);
        const delta = attempt > 1 && first !== null && mine !== null ? mine - first : null;
        return { s, n: i + 1, same: group.length, attempt, delta };
      })
      .reverse()
      .slice(0, this.shown());
  });

  readonly chart = computed(() => {
    const data = this.list().slice(-80);
    const vals = data.map((s) => effective(s));
    const nums = vals.filter((v): v is number => v !== null);
    if (!nums.length) return { points: [], grid: [], avgPath: '' };
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    const pad = (hi - lo || 1000) * 0.12;
    const y0 = lo - pad;
    const y1 = hi + pad;
    const x = (i: number) =>
      this.PL +
      (data.length === 1
        ? (this.W - this.PL - 8) / 2
        : (i * (this.W - this.PL - 8)) / (data.length - 1));
    const y = (v: number) => this.H - 18 - ((v - y0) / (y1 - y0)) * (this.H - 30);
    const points = data.map((s, i) => {
      const v = vals[i];
      return { id: s.id, x: x(i), y: v === null ? y(hi) : y(v), dnf: v === null };
    });
    const grid = [0, 0.5, 1].map((t) => {
      const v = y0 + (y1 - y0) * t;
      return { y: y(v), label: formatTime(v, 1) };
    });
    let d = '';
    for (let i = 4; i < data.length; i++) {
      const a = averageOf(data.slice(i - 4, i + 1), 5);
      if (typeof a === 'number') d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(a).toFixed(1)}`;
    }
    return { points, grid, avgPath: d };
  });

  caseName(id?: string) {
    return id ? (this.algs.byId().get(id)?.name ?? id) : '';
  }

  when(at: number) {
    return new Date(at).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  retry(s: Solve) {
    this.retryService.set({
      mode: s.mode,
      scramble: s.scramble,
      setId: s.setId,
      caseId: s.caseId,
      auf: s.auf,
    });
    void this.router.navigate([s.mode === 'case' ? '/trainer' : '/timer']);
  }

  clearAll() {
    const f = this.filter();
    const label =
      f === 'all'
        ? 'ALL solves'
        : `all ${f === 'random' ? 'random-scramble' : 'case-trainer'} solves`;
    if (confirm(`Delete ${label}? This cannot be undone.`))
      void this.store.clear(f === 'all' ? undefined : f);
  }

  tagLabel(id: string) {
    return MISTAKES.find((m) => m.id === id)?.label ?? id;
  }

  async importJson(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const added = await this.store.importSolves(JSON.parse(await file.text()));
      alert(`Imported ${added} new solve${added === 1 ? '' : 's'}.`);
    } catch (e) {
      alert('Could not import: ' + (e as Error).message);
    }
    input.value = '';
  }

  exportJson() {
    this.download('cube-solves.json', JSON.stringify(this.list(), null, 2), 'application/json');
  }

  exportCsv() {
    const head = 'time_ms,penalty,effective_ms,mode,stage,case,mistakes,scramble,date';
    const lines = this.list().map((s) =>
      [
        s.timeMs,
        s.penalty,
        effective(s) ?? 'DNF',
        s.mode,
        s.stage ?? 'full',
        this.caseName(s.caseId),
        `"${(s.tags ?? []).join(' ')}"`,
        `"${s.scramble}"`,
        new Date(s.at).toISOString(),
      ].join(','),
    );
    this.download('cube-solves.csv', [head, ...lines].join('\n'), 'text/csv');
  }

  private download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
}
