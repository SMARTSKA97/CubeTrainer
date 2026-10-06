import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { AlgCase, AlgService } from '@core/data/alg-service';
import { usePref } from '@core/pref';
import { SolveStore } from '@core/data/solve-store';
import { CaseStatus, averageOf, best, formatTime } from '@domain/stats';

type SortKey = 'order' | 'name' | 'group' | 'best' | 'avg';

@Component({
  selector: 'app-algs-page',
  standalone: true,
  template: `
    @if (algs.error(); as err) {
      <div class="card">{{ err }}</div>
    } @else if (!algs.loaded()) {
      <div class="card muted">Loading algorithms…</div>
    } @else {
      <section class="card">
        <div class="row">
          <label class="field"
            >Set
            <select (change)="setId.set($any($event.target).value); group.set('')">
              @for (s of algs.sets(); track s.id) {
                <option [value]="s.id" [selected]="s.id === setId()">
                  {{ s.label }} ({{ s.count }})
                </option>
              }
            </select>
          </label>
          <label class="field"
            >Group
            <select (change)="group.set($any($event.target).value)">
              <option value="" [selected]="group() === ''">All groups</option>
              @for (g of algs.groupsOf(setId()); track g) {
                <option [value]="g" [selected]="g === group()">{{ g }}</option>
              }
            </select>
          </label>
          <label class="field"
            >Status
            <select (change)="statusFilter.set($any($event.target).value)">
              <option value="" [selected]="statusFilter() === ''">Any</option>
              @for (s of statuses; track s) {
                <option [value]="s" [selected]="s === statusFilter()">{{ s }}</option>
              }
            </select>
          </label>
          <span class="muted">{{ rows().length }} cases</span>
        </div>
      </section>

      <section class="card table-card">
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th class="sortable" (click)="sortBy('name')">Name {{ arrow('name') }}</th>
              <th class="sortable" (click)="sortBy('group')">Group {{ arrow('group') }}</th>
              <th>Algorithm</th>
              <th>Status</th>
              <th class="sortable" (click)="sortBy('best')">Best {{ arrow('best') }}</th>
              <th class="sortable" (click)="sortBy('avg')">Ao5 {{ arrow('avg') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.c.id) {
              <tr>
                <td class="img">
                  @if (algs.imageUrl(r.c); as url) {
                    <img [src]="url" [alt]="r.c.name" width="72" height="72" />
                  }
                </td>
                <td>
                  <b>{{ r.c.name }}</b>
                </td>
                <td class="muted">{{ r.c.group }}</td>
                <td class="alg">
                  <code>{{ r.c.alg }}</code>
                  <button class="btn small" (click)="copy(r.c.alg)">
                    {{ copied() === r.c.id ? 'Copied' : 'Copy' }}
                  </button>
                </td>
                <td>
                  <select
                    class="status"
                    [attr.data-s]="r.status"
                    (change)="store.setStatus(r.c.id, $any($event.target).value)"
                  >
                    @for (s of statuses; track s) {
                      <option [value]="s" [selected]="s === r.status">{{ s }}</option>
                    }
                  </select>
                </td>
                <td class="num">{{ r.best === null ? '-' : fmt(r.best) }}</td>
                <td class="num">{{ fmt(r.ao5) }}</td>
                <td><button class="btn small primary" (click)="train(r.c)">Train</button></td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
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
      white-space: nowrap;
    }
    th.sortable {
      cursor: pointer;
    }
    td.img img {
      background: #fff;
      border-radius: 8px;
      display: block;
    }
    td.alg {
      min-width: 260px;
    }
    td.alg code {
      font-size: 14px;
      margin-right: 8px;
    }
    td.num {
      font-variant-numeric: tabular-nums;
    }
    select.status {
      padding: 4px 6px;
    }
    select.status[data-s='learning'] {
      color: #f59e0b;
    }
    select.status[data-s='finished'] {
      color: #22c55e;
    }
  `,
})
export class AlgsPage {
  readonly algs = inject(AlgService);
  readonly store = inject(SolveStore);
  private readonly router = inject(Router);

  readonly statuses: CaseStatus[] = ['unlearned', 'learning', 'finished'];
  readonly setId = usePref('algs.set', '2lookoll');
  readonly group = signal('');
  readonly statusFilter = signal('');
  readonly sort = signal<{ key: SortKey; dir: 1 | -1 }>({ key: 'order', dir: 1 });
  readonly copied = signal('');

  fmt = (v: number | null | undefined) =>
    v === undefined ? '-' : v === null ? 'DNF' : formatTime(v);

  readonly rows = computed(() => {
    const list = this.algs
      .casesOf(this.setId())
      .filter((c) => !this.group() || c.group === this.group())
      .map((c, order) => {
        const solves = this.store.caseSolves(c.id);
        return {
          c,
          order,
          status: this.store.statusOf(c.id),
          best: best(solves),
          ao5: averageOf(solves, 5),
        };
      })
      .filter((r) => !this.statusFilter() || r.status === this.statusFilter());
    const { key, dir } = this.sort();
    const val = (r: (typeof list)[number]): string | number => {
      switch (key) {
        case 'name':
          return r.c.name;
        case 'group':
          return r.c.group;
        case 'best':
          return r.best ?? Infinity;
        case 'avg':
          return typeof r.ao5 === 'number' ? r.ao5 : Infinity;
        default:
          return r.order;
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  });

  sortBy(key: SortKey) {
    const s = this.sort();
    this.sort.set(s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 });
  }

  arrow(key: SortKey) {
    const s = this.sort();
    return s.key === key ? (s.dir === 1 ? '▲' : '▼') : '';
  }

  async copy(alg: string) {
    try {
      await navigator.clipboard.writeText(alg);
      const c = this.rows().find((r) => r.c.alg === alg);
      this.copied.set(c?.c.id ?? '');
      setTimeout(() => this.copied.set(''), 1200);
    } catch {
      /* clipboard may be blocked */
    }
  }

  train(c: AlgCase) {
    void this.router.navigate(['/trainer'], { queryParams: { case: c.id } });
  }
}
