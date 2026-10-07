import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { AlgService } from '@core/data/alg-service';
import { PlanService } from '@core/data/plan-service';
import { SolveStore } from '@core/data/solve-store';
import { INTERVAL_DAYS } from '@domain/plan';

@Component({
  selector: 'app-today-page',
  standalone: true,
  template: `
    <section class="card hero" data-tour="plan">
      <div>
        <div class="label">Today</div>
        <h2>
          {{
            plan.progress().total === 0
              ? 'Nothing due'
              : plan.progress().done + ' / ' + plan.progress().total + ' reps'
          }}
        </h2>
        <div class="bar"><i [style.width.%]="pct()"></i></div>
        <div class="muted small">
          {{ plan.solvesToday() }} / {{ plan.goal() }} solves today (daily goal) · streak
          <b>{{ plan.streak() }}</b> day{{ plan.streak() === 1 ? '' : 's' }}
        </div>
      </div>
      <button class="btn primary big" (click)="start()" [disabled]="!plan.plan().length">
        Start today's plan
      </button>
    </section>

    <section class="card">
      <div class="label">Plan</div>
      @if (!algs.loaded()) {
        <div class="muted">Loading…</div>
      } @else if (!plan.plan().length) {
        <div class="muted">
          No case is due. Pick the sets you are learning below, or do free practice in the Case
          trainer.
        </div>
      } @else {
        <ul class="items">
          @for (p of plan.plan(); track p.caseId) {
            <li [class.done]="p.done >= p.reps">
              <span class="name">{{ name(p.caseId) }}</span>
              <small class="muted">{{ setLabel(p.setId) }}</small>
              <span class="reason" [attr.data-r]="p.reason">{{ reasonText(p) }}</span>
              <span class="dots">
                @for (d of dots(p.reps); track d) {
                  <i [class.on]="d < p.done"></i>
                }
              </span>
            </li>
          }
        </ul>
        <div class="muted small">
          Spaced repetition: a case you keep nailing rests longer ({{ intervals }} days between
          reviews); a slow day brings it back sooner.
        </div>
      }
    </section>

    <section class="card">
      <div class="label">Sets in my plan</div>
      <div class="row sets">
        @for (s of algs.sets(); track s.id) {
          <label class="check">
            <input
              type="checkbox"
              [checked]="plan.activeSets().includes(s.id)"
              (change)="toggle(s.id)"
            />
            {{ s.label }} <small class="muted">({{ s.count }})</small>
          </label>
        }
      </div>
      <div class="row" style="margin-top:12px">
        <label class="field"
          >Daily goal (solves)
          <input
            type="number"
            min="5"
            step="5"
            style="width:90px"
            [value]="plan.goal()"
            (change)="plan.goal.set(+$any($event.target).value || 30)"
          />
        </label>
        <label class="field"
          >Max cases per day
          <input
            type="number"
            min="3"
            max="40"
            style="width:90px"
            [value]="plan.maxItems()"
            (change)="plan.maxItems.set(+$any($event.target).value || 12)"
          />
        </label>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    h2 {
      margin: 2px 0 8px;
      font-size: 30px;
    }
    .hero {
      display: flex;
      gap: 20px;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
    }
    .hero > div {
      flex: 1;
      min-width: 240px;
    }
    .big {
      padding: 14px 24px;
      font-size: 17px;
    }
    .bar {
      height: 10px;
      background: var(--bg);
      border-radius: 99px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .bar i {
      display: block;
      height: 100%;
      background: #22c55e;
      transition: width 0.3s;
    }
    .small {
      font-size: 13px;
    }
    .items {
      list-style: none;
      margin: 10px 0;
      padding: 0;
      display: grid;
      gap: 6px;
    }
    .items li {
      display: grid;
      grid-template-columns: minmax(70px, 140px) 1fr auto auto;
      gap: 10px;
      align-items: center;
      background: var(--bg);
      border-radius: 10px;
      padding: 8px 12px;
    }
    .items li.done {
      opacity: 0.5;
    }
    @media (max-width: 560px) {
      .items li {
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas:
          'name reason'
          'set dots';
        row-gap: 4px;
      }
      .items li .name {
        grid-area: name;
      }
      .items li small {
        grid-area: set;
      }
      .items li .reason {
        grid-area: reason;
        justify-self: end;
      }
      .items li .dots {
        grid-area: dots;
        justify-self: end;
      }
    }
    .name {
      font-weight: 600;
    }
    .reason {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 99px;
      border: 1px solid var(--line);
    }
    .reason[data-r='due'] {
      color: #60a5fa;
      border-color: #60a5fa;
    }
    .reason[data-r='learning'] {
      color: #f59e0b;
      border-color: #f59e0b;
    }
    .reason[data-r='new'] {
      color: #a78bfa;
      border-color: #a78bfa;
    }
    .dots {
      display: flex;
      gap: 4px;
    }
    .dots i {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 1px solid var(--muted);
    }
    .dots i.on {
      background: #22c55e;
      border-color: #22c55e;
    }
    .sets {
      gap: 8px 18px;
      margin-top: 8px;
    }
  `,
})
export class TodayPage {
  readonly algs = inject(AlgService);
  readonly plan = inject(PlanService);
  private readonly store = inject(SolveStore);
  private readonly router = inject(Router);

  readonly intervals = INTERVAL_DAYS.slice(1).join(' / ');
  readonly pct = computed(() => {
    const p = this.plan.progress();
    return p.total ? Math.min(100, (p.done / p.total) * 100) : 0;
  });

  name(id: string) {
    return this.algs.byId().get(id)?.name ?? id;
  }
  setLabel(id: string) {
    return this.algs.sets().find((s) => s.id === id)?.label ?? id;
  }
  dots(n: number) {
    return Array.from({ length: n }, (_, i) => i);
  }
  reasonText(p: { reason: string; box: number; overdueDays: number }) {
    if (p.reason === 'new') return 'new';
    if (p.reason === 'due') return p.overdueDays > 0 ? `review · ${p.overdueDays}d late` : 'review';
    return 'learning';
  }
  toggle(id: string) {
    this.plan.activeSets.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  }
  start() {
    void this.router.navigate(['/trainer'], { queryParams: { plan: 1 } });
  }
}
