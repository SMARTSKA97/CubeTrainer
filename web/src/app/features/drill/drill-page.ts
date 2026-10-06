import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { AlgCase, AlgService } from '@core/data/alg-service';
import { caseScramble } from '@domain/cube';
import { usePref } from '@core/pref';
import { CROSS_WHITE_HOLD, schemeHex } from '@domain/orientation';
import { ScrambleNet } from '@shared/scramble-net';

interface Option {
  id: string;
  label: string;
}
interface Stat {
  n: number;
  ok: number;
}
const LS = 'cubetrainer.drill.v1';
/** sets where the case NAME is meaningful (OLL 21, PLL "T" ...); for the others the options are algorithms */
const NAMED = new Set(['oll', 'pll', 'coll', 'wv', 'oll']);
const LL_KINDS = new Set(['oll', 'pll', 'coll', 'wv', 'll']);

@Component({
  selector: 'app-drill-page',
  standalone: true,
  imports: [ScrambleNet],
  template: `
    <section class="card">
      <div class="row">
        <label class="field"
          >Set
          <select (change)="chooseSet($any($event.target).value)">
            @for (s of algs.sets(); track s.id) {
              <option [value]="s.id" [selected]="s.id === setId()">{{ s.label }}</option>
            }
          </select>
        </label>
        <label class="field"
          >Picture visible for
          <select (change)="seconds.set(+$any($event.target).value)">
            @for (v of [0, 1, 2, 3, 5]; track v) {
              <option [value]="v" [selected]="v === seconds()">
                {{ v === 0 ? 'until I answer' : v + ' s' }}
              </option>
            }
          </select>
        </label>
        <span class="sep"></span>
        <div class="score">
          <b>{{ session().ok }}</b> / {{ session().n }} correct · streak
          <b>{{ session().streak }}</b>
        </div>
      </div>
      <div class="muted small">
        Recognition drill: look at the case, then say which
        {{ named() ? 'case' : 'algorithm' }} solves it. Fast, accurate recognition is what makes you
        stop pausing between F2L, OLL and PLL.
      </div>
    </section>

    @if (current(); as c) {
      <section class="card quiz">
        <div class="pic">
          @if (!hidden()) {
            <app-scramble-net
              [scramble]="scramble()"
              [scheme]="scheme()"
              [view]="topView() ? 'top' : 'net'"
              [mask]="kind() === 'oll'"
            />
          } @else {
            <div class="muted hide">hidden</div>
          }
        </div>
        <div class="opts">
          @for (o of options(); track o.id) {
            <button
              class="btn opt"
              [class.right]="answered() && o.id === c.id"
              [class.wrong]="answered() && picked() === o.id && o.id !== c.id"
              [disabled]="answered()"
              (click)="answer(o)"
            >
              {{ o.label }}
            </button>
          }
          @if (answered()) {
            <div class="result" [class.good]="picked() === c.id">
              {{ picked() === c.id ? 'Correct' : 'It was ' + c.name }}
              · <code>{{ c.alg }}</code>
            </div>
            <button class="btn primary" (click)="next()">Next case</button>
          }
        </div>
      </section>
    }

    @if (weakest().length) {
      <section class="card">
        <div class="label">Cases you misjudge most</div>
        <div class="row">
          @for (w of weakest(); track w.id) {
            <span class="chip">{{ w.name }} · {{ w.pct }}% of {{ w.n }}</span>
          }
          <button class="btn small" (click)="resetStats()">Reset drill stats</button>
        </div>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .sep {
      flex: 1;
    }
    .small {
      font-size: 13px;
      margin-top: 8px;
    }
    .score {
      font-size: 15px;
    }
    .quiz {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      align-items: flex-start;
    }
    .pic {
      min-width: 180px;
      min-height: 170px;
      display: grid;
      place-items: center;
      background: #0b0d12;
      border-radius: 12px;
      padding: 12px;
    }
    .hide {
      font-size: 14px;
    }
    .opts {
      display: grid;
      gap: 8px;
      flex: 1;
      min-width: 240px;
      align-content: start;
    }
    .opt {
      text-align: left;
      font-size: 17px;
      padding: 12px 14px;
    }
    .opt.right {
      background: #123b24;
      border-color: #22c55e;
    }
    .opt.wrong {
      background: #4a1d1d;
      border-color: #ef4444;
    }
    .result {
      color: #ef4444;
    }
    .result.good {
      color: #22c55e;
    }
    .chip {
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 4px 9px;
      font-size: 13px;
    }
  `,
})
export class DrillPage {
  readonly algs = inject(AlgService);
  readonly setId = usePref('drill.set', 'oll');
  readonly seconds = usePref('drill.seconds', 3);

  readonly current = signal<AlgCase | null>(null);
  readonly options = signal<Option[]>([]);
  readonly scramble = signal('');
  readonly answered = signal(false);
  readonly picked = signal('');
  readonly hidden = signal(false);
  readonly session = signal({ n: 0, ok: 0, streak: 0 });
  private readonly stats = signal<Record<string, Stat>>(this.readStats());
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly scheme = computed(() => schemeHex(CROSS_WHITE_HOLD));
  readonly kind = computed(() => this.algs.sets().find((s) => s.id === this.setId())?.kind ?? '');
  readonly topView = computed(() => LL_KINDS.has(this.kind()));
  readonly named = computed(
    () => NAMED.has(this.setId()) || LL_KINDS.has(this.kind()) || this.setId().startsWith('2look'),
  );
  readonly weakest = computed(() => {
    const byId = this.algs.byId();
    return Object.entries(this.stats())
      .filter(([id, s]) => s.n >= 2 && byId.has(id) && s.ok < s.n)
      .map(([id, s]) => ({
        id,
        name: byId.get(id)!.name,
        n: s.n,
        pct: Math.round(100 - (s.ok / s.n) * 100),
      }))
      .sort((a, b) => b.pct - a.pct || b.n - a.n)
      .slice(0, 6);
  });

  constructor() {
    // start as soon as the data is there
    const t = setInterval(() => {
      if (this.algs.loaded()) {
        clearInterval(t);
        this.next();
      }
    }, 100);
  }

  chooseSet(id: string) {
    this.setId.set(id);
    this.next();
  }

  next() {
    clearTimeout(this.timer);
    const pool = this.algs.casesOf(this.setId());
    if (pool.length < 2) return;
    const last = this.current()?.id;
    // cases you misjudge more often come up more often
    const weights = pool.map((c) => {
      const s = this.stats()[c.id];
      return c.id === last ? 0 : 1 + (s ? (s.n - s.ok) * 2 : 1);
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let chosen = pool[0];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosen = pool[i];
        break;
      }
    }
    this.current.set(chosen);
    this.scramble.set(this.stateFor(chosen));
    this.options.set(this.makeOptions(chosen, pool));
    this.answered.set(false);
    this.picked.set('');
    this.hidden.set(false);
    if (this.seconds() > 0)
      this.timer = setTimeout(() => this.hidden.set(true), this.seconds() * 1000);
  }

  private stateFor(c: AlgCase): string {
    // LL cases are shown with a random U turn: recognition must not depend on the AUF
    const f2l = c.set.startsWith('f2l-') || c.set === 'beginner';
    return caseScramble(c.alg, Math.random, !f2l).scramble;
  }

  private makeOptions(c: AlgCase, pool: AlgCase[]): Option[] {
    const named = this.named();
    const label = (x: AlgCase) => (named ? x.name : x.alg);
    const sameGroup = pool.filter((x) => x.id !== c.id && x.group === c.group);
    const rest = pool.filter((x) => x.id !== c.id && x.group !== c.group);
    const pickN = (arr: AlgCase[], n: number) =>
      [...arr].sort(() => Math.random() - 0.5).slice(0, n);
    const distractors = [...pickN(sameGroup, 3)];
    distractors.push(...pickN(rest, 3 - distractors.length));
    const seen = new Set([label(c)]);
    const out: Option[] = [{ id: c.id, label: label(c) }];
    for (const d of distractors) {
      if (seen.has(label(d))) continue;
      seen.add(label(d));
      out.push({ id: d.id, label: label(d) });
    }
    return out.sort(() => Math.random() - 0.5);
  }

  answer(o: Option) {
    const c = this.current();
    if (!c || this.answered()) return;
    clearTimeout(this.timer);
    this.hidden.set(false);
    this.picked.set(o.id);
    this.answered.set(true);
    const ok = o.id === c.id;
    this.session.update((s) => ({
      n: s.n + 1,
      ok: s.ok + (ok ? 1 : 0),
      streak: ok ? s.streak + 1 : 0,
    }));
    this.stats.update((m) => ({
      ...m,
      [c.id]: { n: (m[c.id]?.n ?? 0) + 1, ok: (m[c.id]?.ok ?? 0) + (ok ? 1 : 0) },
    }));
    try {
      localStorage.setItem(LS, JSON.stringify(this.stats()));
    } catch {
      /* optional */
    }
  }

  resetStats() {
    this.stats.set({});
    try {
      localStorage.removeItem(LS);
    } catch {
      /* optional */
    }
  }

  private readStats(): Record<string, Stat> {
    try {
      return JSON.parse(localStorage.getItem(LS) ?? '{}');
    } catch {
      return {};
    }
  }
}
