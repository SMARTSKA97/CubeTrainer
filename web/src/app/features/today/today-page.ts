import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AlgService } from '@core/data/alg-service';
import { PlanService } from '@core/data/plan-service';
import { INTERVAL_DAYS } from '@domain/plan';
import { XP } from '@domain/xp';
import { formatTime } from '@domain/stats';

@Component({
  selector: 'app-today-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="card hero" data-tour="plan">
      <div class="ring" role="img" [attr.aria-label]="goalText()">
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <circle class="track" cx="40" cy="40" r="34" />
          <circle
            class="fill"
            cx="40"
            cy="40"
            r="34"
            [attr.stroke-dasharray]="circ"
            [attr.stroke-dashoffset]="circ * (1 - goalPct() / 100)"
          />
        </svg>
        <div class="in">
          <b>{{ plan.solvesToday() }}</b>
          <small>of {{ plan.goal() }}</small>
        </div>
      </div>
      <div class="heroText">
        <div class="label">Today</div>
        <h2>
          {{
            plan.progress().total === 0
              ? 'Nothing due'
              : plan.progress().done + ' of ' + plan.progress().total + ' reps'
          }}
        </h2>
        <div class="bar"><i [style.width.%]="pct()"></i></div>
        <div class="muted small">{{ goalText() }}</div>
      </div>
      <button class="btn primary big" (click)="start()" [disabled]="!plan.plan().length">
        Start today's plan
      </button>
    </section>

    <section class="stats3">
      <div class="card tile streak" [class.hot]="plan.streak() > 0">
        <div class="flame" aria-hidden="true">🔥</div>
        <div>
          <b>{{ plan.streak() }}</b>
          <span>day streak</span>
        </div>
        <div class="week" role="img" [attr.aria-label]="'Last seven days'">
          @for (d of plan.week(); track $index) {
            <i [class.on]="d.on" [class.today]="d.today" [title]="d.label"></i>
          }
        </div>
        <small class="muted"
          >Best {{ plan.bestStreak() }} day{{ plan.bestStreak() === 1 ? '' : 's' }}</small
        >
      </div>
      <div class="card tile level">
        <div class="lv" aria-hidden="true">{{ plan.xp().level }}</div>
        <div class="lvtext">
          <b>{{ plan.xp().title }}</b>
          <span>Level {{ plan.xp().level }} · {{ plan.xp().xp }} XP</span>
          <div class="bar thin"><i [style.width.%]="levelPct()"></i></div>
          <small class="muted"
            >{{ plan.xp().span - plan.xp().into }} XP to level {{ plan.xp().level + 1 }}
            @if (plan.xp().today) {
              · +{{ plan.xp().today }} today
            }
          </small>
        </div>
      </div>
    </section>

    <section class="card daily" [class.done]="plan.daily().done">
      <div class="dtop">
        <div>
          <div class="label">Daily challenge · full solve</div>
          <h3>
            @if (plan.daily().done) {
              Solved in {{ time(plan.daily().bestMs) }}
            } @else {
              One scramble, one solve
            }
          </h3>
        </div>
        <span class="xp">+{{ xp.daily }} XP</span>
      </div>
      <code class="scr">{{ plan.dailyScramble() }}</code>
      <div class="dbot">
        <a class="btn primary" routerLink="/timer" [queryParams]="{ daily: 1 }">
          {{
            plan.daily().done
              ? 'Try to beat it'
              : plan.daily().attempts
                ? 'Try again'
                : 'Solve it with the timer'
          }}
        </a>
        <small class="muted"
          >Same scramble all day for everyone. A new one tomorrow.
          @if (plan.daily().attempts) {
            · {{ plan.daily().attempts }} attempt{{ plan.daily().attempts === 1 ? '' : 's' }}
          }
        </small>
      </div>
    </section>

    <section class="card">
      <div class="label">Algorithm plan</div>
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
              <a
                class="item"
                routerLink="/trainer"
                [queryParams]="{ focus: p.caseId, plan: 1 }"
                [attr.aria-label]="'Practise ' + name(p.caseId)"
              >
                <span class="state" aria-hidden="true">{{ p.done >= p.reps ? '✓' : '' }}</span>
                <span class="who">
                  <span class="name">{{ name(p.caseId) }}</span>
                  <small class="muted">{{ setLabel(p.setId) }}</small>
                </span>
                <span class="reason" [attr.data-r]="p.reason">{{ reasonText(p) }}</span>
                <span class="dots">
                  @for (d of dots(p.reps); track d) {
                    <i [class.on]="d < p.done"></i>
                  }
                </span>
                <span class="go" aria-hidden="true">›</span>
              </a>
            </li>
          }
        </ul>
        <div class="muted small">
          Tap a case to practise it. Spaced repetition: a case you keep nailing rests longer ({{
            intervals
          }}
          days between reviews); a slow day brings it back sooner.
        </div>
      }
    </section>

    <details class="card setup">
      <summary>Plan settings</summary>
      <div class="label">Sets in my plan</div>
      <div class="row sets">
        @for (s of algs.sets(); track s.id) {
          <label class="check">
            <input
              type="checkbox"
              [checked]="plan.activeSets().includes(s.id)"
              (change)="toggle(s.id)"
            />
            <span class="nm">{{ s.label }}</span>
            <small class="muted">{{ s.count }}</small>
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
    </details>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    h2 {
      margin: 2px 0 8px;
      font-size: 28px;
    }
    h3 {
      margin: 2px 0 0;
      font-size: 20px;
    }
    .small {
      font-size: 13px;
    }
    .hero {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 8px 22px;
      align-items: center;
      background:
        radial-gradient(120% 140% at 0% 0%, rgba(124, 156, 255, 0.16), transparent 60%),
        var(--panel);
    }
    .ring {
      position: relative;
      width: 96px;
      height: 96px;
    }
    .ring svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    .ring circle {
      fill: none;
      stroke-width: 7;
    }
    .ring .track {
      stroke: var(--bg);
    }
    .ring .fill {
      stroke: #22c55e;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.5s ease;
    }
    .ring .in {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      text-align: center;
      line-height: 1.1;
    }
    .ring b {
      font-size: 24px;
    }
    .ring small {
      color: var(--muted);
      font-size: 11.5px;
    }
    .heroText {
      min-width: 0;
    }
    .big {
      padding: 14px 24px;
      font-size: 16px;
    }
    .bar {
      height: 10px;
      background: var(--bg);
      border-radius: 99px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .bar.thin {
      height: 7px;
      margin: 6px 0 4px;
    }
    .bar i {
      display: block;
      height: 100%;
      background: #22c55e;
      border-radius: 99px;
      transition: width 0.3s;
    }
    .level .bar i {
      background: linear-gradient(90deg, #7c9cff, #a78bfa);
    }
    .stats3 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--gap);
    }
    .tile {
      display: grid;
      gap: 6px 14px;
      align-content: center;
    }
    .streak {
      grid-template-columns: auto 1fr;
      grid-template-areas:
        'flame num'
        'week week'
        'best best';
    }
    .flame {
      grid-area: flame;
      font-size: 34px;
      filter: grayscale(1);
      opacity: 0.55;
    }
    .streak.hot .flame {
      filter: none;
      opacity: 1;
    }
    .streak > div:nth-child(2) {
      grid-area: num;
      display: grid;
    }
    .streak b {
      font-size: 28px;
      line-height: 1;
    }
    .streak span {
      color: var(--muted);
      font-size: 13px;
    }
    .week {
      grid-area: week;
      display: flex;
      gap: 6px;
    }
    .week i {
      flex: 1;
      height: 8px;
      border-radius: 99px;
      background: var(--bg);
      border: 1px solid var(--line);
    }
    .week i.on {
      background: #f59e0b;
      border-color: #f59e0b;
    }
    .week i.today:not(.on) {
      border-color: var(--accent);
    }
    .streak small {
      grid-area: best;
    }
    .level {
      grid-template-columns: auto 1fr;
      align-items: center;
    }
    .lv {
      width: 56px;
      height: 56px;
      border-radius: 18px;
      display: grid;
      place-items: center;
      font-weight: 750;
      font-size: 24px;
      color: #fff;
      background: linear-gradient(135deg, #7c9cff, #a78bfa);
      box-shadow: 0 10px 24px -10px rgba(124, 156, 255, 0.8);
    }
    .lvtext {
      display: grid;
      min-width: 0;
    }
    .lvtext b {
      font-size: 16px;
    }
    .lvtext span {
      color: var(--muted);
      font-size: 13px;
    }
    .daily {
      display: grid;
      gap: 12px;
      border-color: rgba(251, 191, 36, 0.3);
      background:
        radial-gradient(100% 140% at 100% 0%, rgba(251, 191, 36, 0.1), transparent 60%),
        var(--panel);
    }
    .daily.done {
      border-color: rgba(34, 197, 94, 0.4);
      background:
        radial-gradient(100% 140% at 100% 0%, rgba(34, 197, 94, 0.12), transparent 60%),
        var(--panel);
    }
    .dtop {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .xp {
      flex: none;
      font-size: 12.5px;
      font-weight: 650;
      padding: 4px 10px;
      border-radius: 99px;
      color: #fbbf24;
      background: rgba(251, 191, 36, 0.12);
      border: 1px solid rgba(251, 191, 36, 0.35);
    }
    .scr {
      display: block;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--bg);
      font-size: 15px;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }
    .dbot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 16px;
    }
    .dbot .btn {
      text-decoration: none;
    }
    .items {
      list-style: none;
      margin: 12px 0;
      padding: 0;
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
    }
    .items li.done {
      opacity: 0.55;
    }
    .item {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto auto;
      gap: 10px;
      align-items: center;
      padding: 12px 14px;
      color: inherit;
      text-decoration: none;
      background: var(--bg);
      border: 1px solid var(--line-soft);
      border-radius: 14px;
      transition:
        border-color 0.15s,
        transform 0.15s;
    }
    .item:hover {
      border-color: var(--accent);
    }
    .item:active {
      transform: scale(0.99);
    }
    .state {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1.5px solid var(--line);
      display: grid;
      place-items: center;
      font-size: 13px;
      color: #fff;
    }
    .done .state {
      background: #22c55e;
      border-color: #22c55e;
    }
    .who {
      display: grid;
      min-width: 0;
    }
    .name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .who small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .go {
      color: var(--muted);
      font-size: 22px;
      line-height: 1;
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
      width: 9px;
      height: 9px;
      border-radius: 50%;
      border: 1px solid var(--muted);
    }
    .dots i.on {
      background: #22c55e;
      border-color: #22c55e;
    }
    .setup summary {
      cursor: pointer;
      font-weight: 600;
    }
    .setup[open] summary {
      margin-bottom: 12px;
    }
    .sets .nm {
      flex: 1;
      min-width: 0;
    }
    .sets {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
      gap: 2px 24px;
      margin-top: 4px;
    }
    @media (min-width: 1100px) {
      .stats3 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 640px) {
      .hero {
        grid-template-columns: auto 1fr;
      }
      .hero .big {
        grid-column: 1 / -1;
        width: 100%;
      }
      .ring {
        width: 80px;
        height: 80px;
      }
      h2 {
        font-size: 22px;
      }
      .stats3 {
        grid-template-columns: minmax(0, 1fr);
      }
      .item {
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        grid-template-areas:
          'state who reason go'
          'state dots dots go';
        row-gap: 6px;
      }
      .item .state {
        grid-area: state;
      }
      .item .who {
        grid-area: who;
      }
      .item .reason {
        grid-area: reason;
        justify-self: end;
      }
      .item .dots {
        grid-area: dots;
      }
      .item .go {
        grid-area: go;
      }
    }
  `,
})
export class TodayPage {
  readonly algs = inject(AlgService);
  readonly plan = inject(PlanService);
  private readonly router = inject(Router);

  readonly xp = XP;
  readonly circ = 2 * Math.PI * 34;
  readonly intervals = INTERVAL_DAYS.slice(1).join(' / ');
  readonly pct = computed(() => {
    const p = this.plan.progress();
    return p.total ? Math.min(100, (p.done / p.total) * 100) : 0;
  });
  readonly goalPct = computed(() =>
    Math.min(100, (this.plan.solvesToday() / Math.max(1, this.plan.goal())) * 100),
  );
  readonly levelPct = computed(() => {
    const x = this.plan.xp();
    return x.span ? Math.min(100, (x.into / x.span) * 100) : 0;
  });
  readonly goalText = computed(
    () =>
      `${this.plan.solvesToday()} of ${this.plan.goal()} solves today. ${
        this.plan.streak() === 1 ? '1-day streak' : this.plan.streak() + '-day streak'
      }.`,
  );

  time = (ms: number | null) => (ms === null ? '' : formatTime(ms) + ' s');
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
