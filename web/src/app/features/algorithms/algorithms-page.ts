import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { MovePlayer } from '@shared/move-player';
import { invertAlg } from '@domain/cube';
import { CROSS_WHITE_HOLD, schemeHex } from '@domain/orientation';
import { AlgCase, AlgService } from '@core/data/alg-service';
import { usePref } from '@core/pref';
import { SolveStore } from '@core/data/solve-store';
import { CaseStatus, averageOf, best, formatTime } from '@domain/stats';

type SortKey = 'order' | 'name' | 'group' | 'best' | 'avg';

@Component({
  imports: [MovePlayer],
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
                <td class="img" data-a="img">
                  @if (algs.imageUrl(r.c); as url) {
                    <img [src]="url" [alt]="r.c.name" width="72" height="72" />
                  }
                </td>
                <td class="nm" data-a="name">
                  <b>{{ r.c.name }}</b>
                </td>
                <td class="muted grp" data-a="grp">{{ r.c.group }}</td>
                <td class="alg" data-a="alg">
                  <code>{{ r.c.alg }}</code>
                  <span class="acts">
                    <button class="btn small" (click)="watching.set(r.c)">▶ Watch</button>
                    <button class="btn small" (click)="copy(r.c.alg)">
                      {{ copied() === r.c.id ? 'Copied' : 'Copy' }}
                    </button>
                  </span>
                </td>
                <td class="st" data-a="stat">
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
                <td class="num" data-a="best" data-l="Best">
                  {{ r.best === null ? '-' : fmt(r.best) }}
                </td>
                <td class="num" data-a="avg" data-l="Ao5">{{ fmt(r.ao5) }}</td>
                <td data-a="act">
                  <button class="btn small primary" (click)="train(r.c)">Train</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }

    @if (watching(); as w) {
      <button class="scrim" type="button" aria-label="Close" (click)="watching.set(null)"></button>
      <div class="sheet" role="dialog" aria-modal="true" [attr.aria-label]="'Watch ' + w.name">
        <div class="grab" aria-hidden="true"></div>
        <header>
          <div>
            <div class="label">{{ w.group }}</div>
            <h2>{{ w.name }}</h2>
          </div>
          <button class="btn small" type="button" (click)="watching.set(null)">Close</button>
        </header>
        <app-move-player
          [moves]="w.alg"
          [start]="inverse(w.alg)"
          [scheme]="scheme"
          [learn]="true"
        />
        <button class="btn primary" type="button" (click)="train(w)">Train this case</button>
      </div>
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
    .acts {
      display: inline-flex;
      gap: 8px;
      flex-wrap: nowrap;
    }
    .scrim {
      border: 0;
      padding: 0;
      position: fixed;
      inset: 0;
      z-index: 60;
      background: rgba(4, 6, 10, 0.66);
      -webkit-backdrop-filter: blur(3px);
      backdrop-filter: blur(3px);
    }
    .sheet {
      position: fixed;
      z-index: 61;
      left: 0;
      right: 0;
      bottom: 0;
      max-width: 560px;
      margin: 0 auto;
      max-height: 94dvh;
      overflow-y: auto;
      display: grid;
      gap: 16px;
      padding: 10px 20px calc(24px + var(--sab));
      background: var(--panel);
      border: 1px solid var(--line);
      border-bottom: 0;
      border-radius: 26px 26px 0 0;
      box-shadow: 0 -24px 60px -20px rgba(0, 0, 0, 0.8);
    }
    .grab {
      width: 44px;
      height: 4px;
      border-radius: 4px;
      background: var(--line);
      margin: 0 auto;
    }
    .sheet header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
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
    /* Phones: every case becomes its own small card instead of a squeezed table row. */
    @media (max-width: 760px) {
      .table-card {
        background: none;
        border: 0;
        box-shadow: none;
        overflow: visible;
      }
      table,
      tbody {
        display: block;
      }
      thead {
        display: none;
      }
      tr {
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr) minmax(0, 1fr) auto;
        grid-template-areas:
          'img name name act'
          'img grp grp act'
          'alg alg alg alg'
          'stat stat best avg';
        align-items: center;
        gap: 4px 12px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 14px;
        margin-bottom: 12px;
      }
      td {
        display: block;
        border: 0;
        padding: 0;
        min-width: 0;
      }
      td[data-a='img'] {
        grid-area: img;
        grid-row: span 2;
      }
      td[data-a='name'] {
        grid-area: name;
        font-size: 16px;
        align-self: end;
      }
      td[data-a='grp'] {
        grid-area: grp;
        align-self: start;
        font-size: 13px;
      }
      td[data-a='act'] {
        grid-area: act;
      }
      td[data-a='alg'] {
        grid-area: alg;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 10px;
        padding: 10px 12px;
        background: var(--bg);
        border-radius: 12px;
      }
      .acts {
        flex-direction: column;
      }
      td.alg code {
        flex: 1;
        min-width: 0;
        margin: 0;
        font-size: 14px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      td[data-a='stat'] {
        grid-area: stat;
        margin-top: 10px;
      }
      td[data-a='stat'] select {
        width: 100%;
      }
      td[data-a='best'],
      td[data-a='avg'] {
        margin-top: 10px;
        text-align: right;
        font-size: 15px;
        font-weight: 600;
      }
      td[data-a='best'] {
        grid-area: best;
      }
      td[data-a='avg'] {
        grid-area: avg;
      }
      td[data-l]::before {
        content: attr(data-l);
        display: block;
        font-size: 11px;
        font-weight: 500;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      td.img img {
        width: 72px;
        height: 72px;
        object-fit: contain;
      }
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
  readonly watching = signal<AlgCase | null>(null);
  inverse = invertAlg;
  /** the same way the case pictures are drawn: yellow on top, white cross underneath */
  readonly scheme = schemeHex(CROSS_WHITE_HOLD);

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
    this.watching.set(null);
    void this.router.navigate(['/trainer'], { queryParams: { case: c.id } });
  }
}
