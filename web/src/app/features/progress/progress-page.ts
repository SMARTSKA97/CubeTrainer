import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { AlgCase, AlgService } from '@core/data/alg-service';
import { LearningSettings } from '@core/data/learning-settings';
import { PlanService } from '@core/data/plan-service';
import { SolveStore } from '@core/data/solve-store';
import { SolveFilterState } from '@core/data/solve-filter-state';
import { SolveFilterBar } from '@shared/solve-filter-bar';
import { MISTAKES, STAGES, Solve, formatTime, mean, sessionStats } from '@domain/stats';
import { Router } from '@angular/router';
import { usePref } from '@core/pref';

interface Cell {
  c: AlgCase;
  ratio: number | null;
  mean: number | null;
  n: number;
  heat: 'none' | 'great' | 'good' | 'slow' | 'bad';
}

@Component({
  selector: 'app-progress-page',
  standalone: true,
  imports: [SolveFilterBar],
  template: `
    <section class="card summary">
      <div>
        <span>Streak</span><b>{{ plan.streak() }} d</b>
      </div>
      <div>
        <span>Solves today</span><b>{{ plan.solvesToday() }} / {{ plan.goal() }}</b>
      </div>
      <div>
        <span>Finished cases</span><b>{{ counts().finished }}</b>
      </div>
      <div>
        <span>Learning</span><b>{{ counts().learning }}</b>
      </div>
      <div>
        <span>Unlearned</span><b>{{ counts().unlearned }}</b>
      </div>
    </section>

    <section class="card">
      <div class="label">Last 14 days</div>
      <div class="days">
        @for (d of days(); track d.label) {
          <div class="day" [title]="d.label + ': ' + d.n + ' solves'">
            <i [style.height.px]="d.h" [class.goal]="d.n >= plan.goal()"></i>
            <small>{{ d.short }}</small>
          </div>
        }
      </div>
    </section>

    <section class="card">
      <div class="row">
        <div class="label">Case heatmap — mean of your last 5 vs the target of the set</div>
        <span class="sep"></span>
        <select (change)="setId.set($any($event.target).value)">
          @for (s of algs.sets(); track s.id) {
            <option [value]="s.id" [selected]="s.id === setId()">{{ s.label }}</option>
          }
        </select>
      </div>
      <div class="legend">
        <span class="k none"></span> not tried <span class="k great"></span> under target
        <span class="k good"></span> ≤ 1.5× <span class="k slow"></span> ≤ 2.5×
        <span class="k bad"></span> slower · outline = status (green finished, amber learning)
      </div>
      <div class="heat">
        @for (x of cells(); track x.c.id) {
          <button
            class="cell"
            [class]="'cell ' + x.heat"
            [attr.data-s]="store.statusOf(x.c.id)"
            [title]="tip(x)"
            (click)="open(x.c)"
          >
            <b>{{ x.c.name }}</b>
            <small>{{ x.mean === null ? '–' : fmt(x.mean) }}</small>
          </button>
        }
      </div>
      <div class="muted small">
        Target for this set: {{ target() }} s. Click a case to practise it.
      </div>
    </section>

    <section class="card">
      <div class="label">Filter the two tables below</div>
      <app-solve-filter-bar />
    </section>

    <section class="card">
      <div class="label">Timer solves by stage</div>
      <table>
        <thead>
          <tr>
            <th>Stage</th>
            <th>Solves</th>
            <th>Best</th>
            <th>Mean</th>
            <th>Ao5</th>
            <th>Ao12</th>
          </tr>
        </thead>
        <tbody>
          @for (r of stageRows(); track r.id) {
            <tr>
              <td>{{ r.label }}</td>
              <td>{{ r.s.count }}</td>
              <td>{{ f(r.s.best) }}</td>
              <td>{{ f(r.s.mean) }}</td>
              <td>{{ f(r.s.ao5) }}</td>
              <td>{{ f(r.s.ao12) }}</td>
            </tr>
          }
        </tbody>
      </table>
      <div class="muted small">
        Tag solves with the stage you practised on the Timer page to fill this in. A full solve is
        split into stages by practising each on its own.
      </div>
    </section>

    <section class="card">
      <div class="label">Mistakes you tagged</div>
      @if (mistakes().length) {
        <div class="row">
          @for (m of mistakes(); track m.id) {
            <span class="chip"
              ><b>{{ m.n }}</b> × {{ m.label }}</span
            >
          }
        </div>
      } @else {
        <div class="muted">
          Nothing tagged yet. After a solve, tap what went wrong (pause, misrecognised case,
          lock-up…) and the pattern shows up here.
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;
    }
    .summary div {
      background: var(--bg);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .summary span {
      display: block;
      font-size: 12px;
      color: var(--muted);
    }
    .summary b {
      font-size: 22px;
      font-variant-numeric: tabular-nums;
    }
    .sep {
      flex: 1;
    }
    .days {
      display: flex;
      gap: 6px;
      align-items: flex-end;
      height: 90px;
      margin-top: 10px;
    }
    .day {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 3px;
      flex: 1;
      height: 100%;
    }
    .day i {
      display: block;
      width: 100%;
      max-width: 26px;
      background: var(--accent);
      border-radius: 4px 4px 0 0;
      min-height: 2px;
      opacity: 0.75;
    }
    .day i.goal {
      background: #22c55e;
      opacity: 1;
    }
    .day small {
      font-size: 10px;
      color: var(--muted);
    }
    .legend {
      font-size: 12px;
      color: var(--muted);
      margin: 8px 0;
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      align-items: center;
    }
    .k {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 3px;
      vertical-align: -1px;
      margin-right: 4px;
    }
    .heat {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(74px, 1fr));
      gap: 6px;
      max-height: 480px;
      overflow: auto;
      padding: 3px;
    }
    .cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 8px 4px;
      border-radius: 10px;
      border: 2px solid transparent;
      color: #0b0d12;
      cursor: pointer;
      font: inherit;
    }
    .cell b {
      font-size: 13px;
    }
    .cell small {
      font-size: 11px;
    }
    .cell[data-s='finished'] {
      border-color: #22c55e;
    }
    .cell[data-s='learning'] {
      border-color: #f59e0b;
    }
    .none,
    .k.none {
      background: #2a3040;
      color: #8b93a7;
    }
    .great,
    .k.great {
      background: #34d399;
    }
    .good,
    .k.good {
      background: #a3e635;
    }
    .slow,
    .k.slow {
      background: #fbbf24;
    }
    .bad,
    .k.bad {
      background: #f87171;
    }
    .small {
      font-size: 13px;
      margin-top: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      margin-top: 6px;
    }
    th,
    td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      font-variant-numeric: tabular-nums;
    }
    th {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
    }
    .chip {
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 5px 10px;
    }
  `,
})
export class ProgressPage {
  readonly algs = inject(AlgService);
  readonly store = inject(SolveStore);
  readonly plan = inject(PlanService);
  private readonly view = inject(SolveFilterState);
  private readonly learning = inject(LearningSettings);
  private readonly router = inject(Router);

  readonly setId = usePref('progress.set', '2lookoll');
  readonly target = computed(() => this.learning.targetMs(this.setId()) / 1000);

  readonly counts = computed(() => {
    const st = this.store.status();
    const all = this.algs.cases();
    const out = { finished: 0, learning: 0, unlearned: 0 };
    for (const c of all) out[(st[c.id] ?? 'unlearned') as keyof typeof out]++;
    return out;
  });

  readonly cells = computed<Cell[]>(() => {
    const target = this.learning.targetMs(this.setId());
    return this.algs.casesOf(this.setId()).map((c) => {
      const list = this.store.caseSolves(c.id);
      const recent = list.slice(-5);
      const m = recent.length ? mean(recent) : null;
      const ratio = m === null ? null : m / target;
      const heat =
        ratio === null
          ? 'none'
          : ratio <= 1
            ? 'great'
            : ratio <= 1.5
              ? 'good'
              : ratio <= 2.5
                ? 'slow'
                : 'bad';
      return { c, ratio, mean: m, n: list.length, heat };
    });
  });

  readonly days = computed(() => {
    const out: { label: string; short: string; n: number; h: number }[] = [];
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const counts = Array.from({ length: 14 }, () => 0);
    for (const s of this.store.solves()) {
      const idx =
        13 -
        Math.floor(
          (startOfToday.getTime() - new Date(new Date(s.at).setHours(0, 0, 0, 0)).getTime()) /
            86400000,
        );
      if (idx >= 0 && idx < 14) counts[idx]++;
    }
    const max = Math.max(1, ...counts, this.plan.goal());
    counts.forEach((n, i) => {
      const d = new Date(startOfToday.getTime() - (13 - i) * 86400000);
      out.push({
        label: d.toDateString(),
        short: String(d.getDate()),
        n,
        h: Math.round((n / max) * 70),
      });
    });
    return out;
  });

  readonly stageRows = computed(() =>
    STAGES.map((st) => ({
      ...st,
      s: sessionStats(
        this.view
          .solves()
          .filter((s: Solve) => s.mode === 'random' && (s.stage ?? 'full') === st.id),
      ),
    })).filter((r) => r.s.count > 0 || r.id === 'full'),
  );

  readonly mistakes = computed(() => {
    const counts = new Map<string, number>();
    for (const s of this.view.solves().slice(-300))
      for (const t of s.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return MISTAKES.map((m) => ({ ...m, n: counts.get(m.id) ?? 0 }))
      .filter((m) => m.n > 0)
      .sort((a, b) => b.n - a.n);
  });

  fmt = (ms: number) => formatTime(ms, 1);
  f = (v: number | null | undefined) => (v === null || v === undefined ? '-' : formatTime(v));
  tip(x: Cell) {
    return `${x.c.name} · ${x.n} attempt${x.n === 1 ? '' : 's'} · ${this.store.statusOf(x.c.id)}${x.mean === null ? '' : ' · mean of last 5: ' + formatTime(x.mean)}`;
  }
  open(c: AlgCase) {
    void this.router.navigate(['/trainer'], { queryParams: { case: c.id } });
  }
}
