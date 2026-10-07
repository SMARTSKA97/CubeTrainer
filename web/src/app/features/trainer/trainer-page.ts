import {
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { caseScramble, invertAlg } from '@domain/cube';
import { AlgCase, AlgService } from '@core/data/alg-service';
import { usePref } from '@core/pref';
import { RetryService } from '@core/data/retry';
import { LearningSettings } from '@core/data/learning-settings';
import { PlanService } from '@core/data/plan-service';
import { evaluateCase } from '@domain/learning';
import { SolveStore } from '@core/data/solve-store';
import {
  CaseStatus,
  Solve,
  averageOf,
  best,
  effective,
  formatSolve,
  formatTime,
  mean,
  retryComparison,
} from '@domain/stats';
import { ScrambleNet } from '@shared/scramble-net';
import { HoldPicker } from '@shared/hold-picker';
import { CROSS_WHITE_HOLD, Hold, schemeHex } from '@domain/orientation';
import { TimerPanel, TimerResult } from '@shared/timer-panel';
import { SolveTags } from '@shared/solve-tags';

interface QueueItem {
  caseId: string;
  scramble: string;
  auf: number;
}

@Component({
  selector: 'app-trainer-page',
  standalone: true,
  imports: [TimerPanel, ScrambleNet, HoldPicker, SolveTags],
  template: `
    @if (algs.error(); as err) {
      <div class="card">{{ err }}</div>
    } @else if (!algs.loaded()) {
      <div class="card muted">Loading algorithms…</div>
    } @else {
      @if (planMode()) {
        <section class="card plan-banner">
          <b>Daily plan</b>
          <span
            >{{ plan.progress().done }} / {{ plan.progress().total }} reps ·
            {{ plan.progress().itemsDone }} / {{ plan.progress().items }} cases done</span
          >
          @if (plan.progress().total > 0 && plan.progress().done >= plan.progress().total) {
            <span class="good-text">Plan complete — nice work!</span>
          }
          <button class="btn small" (click)="exitPlan()">Free practice</button>
        </section>
      }
      <section class="card">
        <div class="row">
          <label class="field"
            >Algorithm set
            <select (change)="chooseSet($any($event.target).value)">
              @for (s of algs.sets(); track s.id) {
                <option [value]="s.id" [selected]="s.id === setId()">
                  {{ s.label }} ({{ s.count }})
                </option>
              }
            </select>
          </label>
        </div>
        <div class="opts">
          <label class="check"
            ><input
              type="checkbox"
              [checked]="randomAuf()"
              (change)="randomAuf.set($any($event.target).checked); regenerate()"
            />
            Rotate case randomly (AUF)</label
          >
          <label class="check"
            ><input
              type="checkbox"
              [checked]="weakFocus()"
              (change)="weakFocus.set($any($event.target).checked)"
            />
            Focus on weak cases</label
          >
          <label class="check"
            ><input
              type="checkbox"
              [checked]="showImage()"
              (change)="showImage.set($any($event.target).checked)"
            />
            Show case picture</label
          >
          <label class="check"
            ><input
              type="checkbox"
              [checked]="inspection()"
              (change)="inspection.set($any($event.target).checked)"
            />
            15 s inspection</label
          >
        </div>
        <details class="picker">
          <summary>Learning rules</summary>
          <div class="opts learn-row">
            <label class="check"
              ><input
                type="checkbox"
                [checked]="learning.auto()"
                (change)="learning.auto.set($any($event.target).checked)"
              />
              Auto-learning (status follows your times)</label
            >
            <label class="field"
              >“Finished” when mean of last 5 ≤
              <span class="unit">
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  style="width:80px"
                  [value]="targetSec()"
                  (change)="learning.setTarget(setId(), +$any($event.target).value)"
                />
                seconds
              </span>
            </label>
            <label class="check"
              ><input
                type="checkbox"
                [checked]="learning.minDays() > 1"
                (change)="learning.minDays.set($any($event.target).checked ? 2 : 1)"
              />
              on ≥ 2 different days</label
            >
          </div>
        </details>

        <details
          class="picker"
          [open]="pickerOpen()"
          (toggle)="pickerOpen.set($any($event.target).open)"
        >
          <summary>
            Cases to train: <b>{{ selectedCount() }}</b> of {{ setCases().length }}
            <span class="muted">(click to choose)</span>
          </summary>
          <div class="row picker-tools">
            @for (g of groups(); track g) {
              <button class="btn small" (click)="toggleGroup(g)">{{ g }}</button>
            }
            <span class="sep"></span>
            <button class="btn small" (click)="selectAll(true)">All</button>
            <button class="btn small" (click)="selectAll(false)">None</button>
            <button class="btn small" (click)="selectStatus('learning')">Only “learning”</button>
            <button class="btn small" (click)="selectStatus('unlearned')">Only “unlearned”</button>
          </div>
          <div class="grid">
            @for (c of setCases(); track c.id) {
              <label class="case" [class.off]="!isSelected(c.id)">
                <input type="checkbox" [checked]="isSelected(c.id)" (change)="toggle(c.id)" />
                @if (algs.imageUrl(c); as url) {
                  <img [src]="url" [alt]="c.name" width="64" height="64" />
                }
                <span>{{ c.name }}</span>
                <small class="status" [attr.data-s]="store.statusOf(c.id)">{{
                  store.statusOf(c.id)
                }}</small>
              </label>
            }
          </div>
        </details>
      </section>

      @if (current(); as item) {
        @if (currentCase(); as c) {
          <section class="card">
            <div class="head">
              <div>
                <div class="label">{{ c.group }}</div>
                <h2>{{ hideName() ? 'Which case is this?' : c.name }}</h2>
                <app-hold-picker
                  [value]="hold()"
                  (valueChange)="hold.set($event)"
                  title="Hold the solved cube like this, then scramble"
                  topLabel="Top (last layer)"
                  [presets]="presets"
                />
                <div class="label" style="margin-top:12px">Scramble</div>
                <div class="scramble">{{ item.scramble }}</div>
                @if (item.auf) {
                  <div class="muted small-note">
                    Case is rotated by {{ aufLabel(item.auf) }}; do a matching U turn before the
                    algorithm.
                  </div>
                }
                @if (cmp().attempts > 0) {
                  <div class="retry-note">
                    Seen {{ cmp().attempts }}× on this exact scramble · best {{ fmt(cmp().best) }}
                  </div>
                }
              </div>
              <div class="visuals">
                <app-scramble-net [scramble]="item.scramble" [scheme]="scheme()" />
                @if (showImage() && algs.imageUrl(c); as url) {
                  <figure>
                    <img [src]="url" [alt]="c.name" width="120" height="120" />
                    <figcaption>Case as the algorithm expects it</figcaption>
                  </figure>
                }
              </div>
            </div>

            <div class="row">
              <button class="btn" (click)="prev()" [disabled]="index() === 0" title="Alt + ←">
                ← Previous
              </button>
              <button class="btn primary" (click)="next()" title="Alt + →">Next case</button>
              <button class="btn" (click)="hintOpen.set(!hintOpen())" title="← / →">
                {{ hintOpen() ? 'Hide' : 'Show' }} algorithm
              </button>
              <label class="check"
                ><input
                  type="checkbox"
                  [checked]="hideName()"
                  (change)="hideName.set($any($event.target).checked)"
                />
                Hide case name (recognition practice)</label
              >
              <label class="field"
                >Status
                <select (change)="store.setStatus(c.id, $any($event.target).value)">
                  @for (s of statuses; track s) {
                    <option [value]="s" [selected]="store.statusOf(c.id) === s">{{ s }}</option>
                  }
                </select>
              </label>
            </div>

            @if (hintOpen()) {
              <div class="alg">
                <div>
                  <span class="label">Algorithm</span> <code>{{ c.alg }}</code>
                </div>
                @if (c.algs && c.algs.length > 1) {
                  <div class="label">Other algorithms for this case</div>
                  @for (a of c.algs; track a.alg) {
                    @if (a.alg !== c.alg) {
                      <div>
                        <code>{{ a.alg }}</code>
                        @if (a.multi) {
                          <span class="muted"> — also affects a second slot</span>
                        }
                      </div>
                    }
                  }
                }
                @if (c.slots?.length) {
                  <div class="muted small-note">
                    Pair in slot {{ c.slots!.join(' + ') }}. Cross stays on the bottom; the rest of
                    the cube is solved.
                  </div>
                }
                <div>
                  <span class="label">Scramble is its inverse</span>
                  <code>{{ inverse(c.alg) }}</code>
                </div>
              </div>
            }
          </section>

          <app-timer-panel
            #timer
            [inspection]="inspection()"
            [sound]="false"
            (finished)="onFinished($event)"
          />

          @if (last(); as l) {
            <section class="card last">
              <div>
                <div class="label">Last solve · {{ lastCaseName() }}</div>
                <div class="last-time">{{ formatSolve(l) }}</div>
                @if (message()) {
                  <div class="msg" [class.good]="messageGood()">{{ message() }}</div>
                }
              </div>
              <div class="row">
                <button class="btn" (click)="penalty('plus2')" [class.on]="l.penalty === 'plus2'">
                  +2
                </button>
                <button class="btn" (click)="penalty('dnf')" [class.on]="l.penalty === 'dnf'">
                  DNF
                </button>
                <button class="btn danger" (click)="remove()">Delete</button>
                <button class="btn primary" (click)="retrySame()">Retry this scramble</button>
              </div>
              <app-solve-tags [solve]="l" style="flex-basis:100%" />
            </section>
          }

          <section class="card">
            <div class="label">{{ c.name }} — your times</div>
            <div class="learn" [attr.data-s]="store.statusOf(c.id)">
              <b>{{ store.statusOf(c.id) }}</b>
              @if (learning.auto()) {
                <span>— {{ info().reason }}</span>
              }
            </div>
            <div class="stats">
              <div>
                <span>Attempts</span><b>{{ caseStats().count }}</b>
              </div>
              <div>
                <span>Best</span><b>{{ fmt(caseStats().best) }}</b>
              </div>
              <div>
                <span>Mean</span><b>{{ fmt(caseStats().mean) }}</b>
              </div>
              <div>
                <span>Ao5</span
                ><b>{{ caseStats().ao5 === undefined ? '-' : fmt(caseStats().ao5!) }}</b>
              </div>
            </div>
          </section>
        }
      } @else {
        <div class="card muted">Select at least one case to train.</div>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .unit {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--text);
    }
    h2 {
      margin: 2px 0 0;
      font-size: 28px;
    }
    .head {
      display: flex;
      gap: 24px;
      justify-content: space-between;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .visuals {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
      gap: 16px;
      align-items: start;
      justify-items: center;
    }
    figure {
      margin: 0;
      text-align: center;
      background: #fff;
      border-radius: 12px;
      padding: 6px;
      color: #333;
    }
    figcaption {
      font-size: 11px;
      color: #555;
      max-width: 120px;
    }
    .scramble {
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: clamp(17px, 2.6vw, 24px);
      line-height: 1.5;
      word-spacing: 5px;
      max-width: 620px;
    }
    .small-note {
      font-size: 13px;
      margin-top: 6px;
    }
    .retry-note {
      margin-top: 8px;
      color: var(--accent);
      font-size: 14px;
    }
    .alg {
      margin-top: 14px;
      padding: 12px 14px;
      background: var(--bg);
      border-radius: 10px;
      display: grid;
      gap: 6px;
    }
    .alg code {
      font-size: 17px;
      margin-left: 8px;
    }
    .opts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
      gap: 0 20px;
    }
    .opts .field {
      grid-column: 1 / -1;
    }
    .picker {
      border-top: 1px solid var(--line-soft);
      padding-top: 6px;
    }
    .picker summary {
      cursor: pointer;
      padding: 6px 0;
    }
    .picker-tools {
      margin: 8px 0;
    }
    .sep {
      flex: 1;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
      gap: 8px;
      max-height: 360px;
      overflow: auto;
      padding: 4px;
    }
    .case {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 6px;
      font-size: 12px;
      text-align: center;
      cursor: pointer;
      position: relative;
    }
    .case input {
      position: absolute;
      top: 6px;
      left: 6px;
    }
    .case img {
      background: #fff;
      border-radius: 6px;
    }
    .case.off {
      opacity: 0.4;
    }
    .status {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }
    .status[data-s='learning'] {
      color: #f59e0b;
    }
    .status[data-s='finished'] {
      color: #22c55e;
    }
    .last {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .last-time {
      font-size: 28px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .msg {
      font-size: 14px;
      color: var(--muted);
    }
    .msg.good {
      color: #22c55e;
    }
    .plan-banner {
      display: flex;
      gap: 14px;
      align-items: center;
      flex-wrap: wrap;
      border-color: var(--accent);
    }
    .good-text {
      color: #22c55e;
    }
    .learn {
      margin-top: 6px;
      font-size: 14px;
      color: var(--muted);
    }
    .learn b {
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.05em;
    }
    .learn[data-s='learning'] b {
      color: #f59e0b;
    }
    .learn[data-s='finished'] b {
      color: #22c55e;
    }
    .learn-row {
      margin-top: 8px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 10px;
      margin-top: 10px;
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
  `,
})
export class TrainerPage {
  readonly algs = inject(AlgService);
  readonly store = inject(SolveStore);
  readonly learning = inject(LearningSettings);
  readonly plan = inject(PlanService);
  /** true = cases come from today's plan instead of the picker */
  readonly planMode = signal(false);
  private readonly retryService = inject(RetryService);
  private readonly route = inject(ActivatedRoute);
  private readonly timer = viewChild<TimerPanel>('timer');

  readonly statuses: CaseStatus[] = ['unlearned', 'learning', 'finished'];

  readonly setId = usePref('trainer.set', '2lookoll');
  readonly randomAuf = usePref('trainer.auf', false);
  readonly hold = usePref<Hold>('trainer.hold', CROSS_WHITE_HOLD);
  readonly scheme = computed(() => schemeHex(this.hold()));
  readonly presets = [
    { label: 'White cross bottom, red front (as in the F2L PDF)', hold: CROSS_WHITE_HOLD },
    { label: 'White cross bottom, green front', hold: { top: 'yellow', front: 'green' } as Hold },
  ];
  /** F2L cases are built from the exact setup; a random U turn would change the slot picture */
  private useAuf(c: AlgCase) {
    return this.randomAuf() && !c.set.startsWith('f2l-');
  }
  readonly weakFocus = usePref('trainer.weak', false);
  readonly showImage = usePref('trainer.image', true);
  readonly inspection = usePref('trainer.inspection', false);
  readonly hideName = usePref('trainer.hideName', false);
  readonly pickerOpen = signal(false);
  readonly hintOpen = signal(false);
  /** cases excluded from training, per set id */
  private readonly excluded = usePref<Record<string, string[]>>('trainer.excluded', {});

  private readonly queue = signal<QueueItem[]>([]);
  readonly index = signal(0);
  readonly current = computed(() => this.queue()[this.index()] ?? null);
  readonly currentCase = computed(() => {
    const c = this.current();
    return c ? (this.algs.byId().get(c.caseId) ?? null) : null;
  });

  readonly last = signal<Solve | null>(null);
  readonly message = signal('');
  readonly messageGood = signal(false);

  readonly setCases = computed(() => this.algs.casesOf(this.setId()));
  readonly groups = computed(() => this.algs.groupsOf(this.setId()));
  readonly selectedCount = computed(() => this.selectedCases().length);
  readonly selectedCases = computed(() => {
    const ex = new Set(this.excluded()[this.setId()] ?? []);
    return this.setCases().filter((c) => !ex.has(c.id));
  });

  readonly caseStats = computed(() => {
    const c = this.currentCase();
    const list = c ? this.store.caseSolves(c.id) : [];
    return { count: list.length, best: best(list), mean: mean(list), ao5: averageOf(list, 5) };
  });
  readonly cmp = computed(() => {
    const it = this.current();
    return it
      ? retryComparison(
          this.store.solves().filter((s) => s.mode === 'case'),
          it.scramble,
        )
      : { attempts: 0, best: null, last: null };
  });
  readonly targetSec = computed(
    () => this.learning.targetMs(this.currentCase()?.set ?? this.setId()) / 1000,
  );
  readonly info = computed(() => {
    const c = this.currentCase();
    const list = c ? this.store.caseSolves(c.id) : [];
    return evaluateCase(
      list,
      this.learning.targetMs(c?.set ?? this.setId()),
      c ? this.store.statusOf(c.id) : 'unlearned',
      this.learning.rules(),
      new Date().getTimezoneOffset(),
    );
  });
  readonly lastCaseName = computed(() => {
    const l = this.last();
    return l?.caseId ? (this.algs.byId().get(l.caseId)?.name ?? '') : '';
  });

  readonly formatSolve = formatSolve;
  fmt = (v: number | null | undefined) =>
    v === null || v === undefined ? (v === null ? 'DNF' : '-') : formatTime(v);
  inverse = invertAlg;

  constructor() {
    // Build the first scramble once the algorithm list is loaded (and honour retry / ?case= links).
    effect(() => {
      if (!this.algs.loaded()) return;
      untracked(() => {
        if (this.queue().length) return;
        const pending = this.retryService.take('case');
        const wanted = this.route.snapshot.queryParamMap.get('case');
        if (pending?.caseId && this.algs.byId().has(pending.caseId)) {
          const c = this.algs.byId().get(pending.caseId)!;
          this.setId.set(c.set);
          this.queue.set([{ caseId: c.id, scramble: pending.scramble, auf: pending.auf ?? 0 }]);
          this.index.set(0);
        } else if (wanted && this.algs.byId().has(wanted)) {
          const c = this.algs.byId().get(wanted)!;
          this.setId.set(c.set);
          this.excluded.update((m) => ({
            ...m,
            [c.set]: this.algs
              .casesOf(c.set)
              .filter((x) => x.id !== c.id)
              .map((x) => x.id),
          }));
          this.push(c);
        } else {
          if (this.route.snapshot.queryParamMap.get('plan')) this.planMode.set(true);
          this.next();
        }
      });
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
    if (e.altKey && e.code === 'ArrowRight') this.next();
    else if (e.altKey && e.code === 'ArrowLeft') this.prev();
    else if (!e.altKey && e.code === 'ArrowRight') this.hintOpen.set(true);
    else if (!e.altKey && e.code === 'ArrowLeft') this.hintOpen.set(false);
  }

  // ------------------------------------------------------------- selection

  exitPlan() {
    this.planMode.set(false);
    this.queue.set([]);
    this.index.set(0);
    this.last.set(null);
    this.next();
  }

  chooseSet(id: string) {
    this.planMode.set(false);
    this.setId.set(id);
    this.queue.set([]);
    this.index.set(0);
    this.last.set(null);
    this.next();
  }

  isSelected(id: string) {
    return !(this.excluded()[this.setId()] ?? []).includes(id);
  }

  toggle(id: string) {
    this.excluded.update((m) => {
      const cur = new Set(m[this.setId()] ?? []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { ...m, [this.setId()]: [...cur] };
    });
  }

  selectAll(on: boolean) {
    this.excluded.update((m) => ({
      ...m,
      [this.setId()]: on ? [] : this.setCases().map((c) => c.id),
    }));
  }

  toggleGroup(group: string) {
    const ids = this.setCases()
      .filter((c) => c.group === group)
      .map((c) => c.id);
    const allOn = ids.every((id) => this.isSelected(id));
    this.excluded.update((m) => {
      const cur = new Set(m[this.setId()] ?? []);
      for (const id of ids) {
        if (allOn) cur.add(id);
        else cur.delete(id);
      }
      return { ...m, [this.setId()]: [...cur] };
    });
  }

  selectStatus(status: CaseStatus) {
    const keep = new Set(
      this.setCases()
        .filter((c) => this.store.statusOf(c.id) === status)
        .map((c) => c.id),
    );
    if (!keep.size) return;
    this.excluded.update((m) => ({
      ...m,
      [this.setId()]: this.setCases()
        .filter((c) => !keep.has(c.id))
        .map((c) => c.id),
    }));
  }

  // -------------------------------------------------------------- scrambles

  /** Plan mode: the unfinished plan item that is least advanced (round robin), never the same case twice in a row. */
  private pickFromPlan(): AlgCase | null {
    const remaining = this.plan.plan().filter((p) => p.done < p.reps);
    if (!remaining.length) return null;
    const lastId = this.current()?.caseId;
    const pool = remaining.length > 1 ? remaining.filter((p) => p.caseId !== lastId) : remaining;
    pool.sort((a, b) => a.done / a.reps - b.done / b.reps);
    return this.algs.byId().get(pool[0].caseId) ?? null;
  }

  private pick(): AlgCase | null {
    if (this.planMode()) {
      const c = this.pickFromPlan();
      if (c) return c;
      // plan finished: carry on with free practice instead of getting stuck
    }
    const pool = this.selectedCases();
    if (!pool.length) return null;
    const lastId = this.current()?.caseId;
    const candidates = pool.length > 1 ? pool.filter((c) => c.id !== lastId) : pool;
    if (!this.weakFocus()) return candidates[Math.floor(Math.random() * candidates.length)];
    // weight by average time; never-attempted cases count as slow
    const weights = candidates.map((c) => {
      const avg = mean(this.store.caseSolves(c.id).slice(-5));
      return avg === null ? 12 : 1 + avg / 1000;
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  private push(c: AlgCase) {
    const cs = caseScramble(c.alg, Math.random, this.useAuf(c));
    this.queue.update((q) => [
      ...q.slice(0, this.index() + (q.length ? 1 : 0)),
      { caseId: c.id, scramble: cs.scramble, auf: cs.auf },
    ]);
    this.index.set(this.queue().length - 1);
  }

  next() {
    if (this.queue().length && this.index() < this.queue().length - 1) {
      this.index.update((i) => i + 1);
    } else {
      const c = this.pick();
      if (!c) return;
      this.push(c);
    }
    this.afterChange();
  }

  prev() {
    if (this.index() > 0) this.index.update((i) => i - 1);
    this.afterChange();
  }

  /** New scramble for the same case (e.g. after toggling the AUF option). */
  regenerate() {
    const c = this.currentCase();
    if (!c) return;
    const cs = caseScramble(c.alg, Math.random, this.useAuf(c));
    this.queue.update((q) =>
      q.map((it, i) =>
        i === this.index() ? { caseId: c.id, scramble: cs.scramble, auf: cs.auf } : it,
      ),
    );
    this.afterChange();
  }

  private afterChange() {
    this.message.set('');
    this.hintOpen.set(false);
    this.timer()?.cancel();
  }

  aufLabel(n: number) {
    return n === 1 ? 'U' : n === 2 ? 'U2' : "U'";
  }

  // ------------------------------------------------------------------ solves

  async onFinished(r: TimerResult) {
    const item = this.current();
    const c = this.currentCase();
    if (!item || !c) return;
    const prior = this.store.caseSolves(c.id);
    const before = retryComparison(
      this.store.solves().filter((s) => s.mode === 'case'),
      item.scramble,
    );
    const solve = await this.store.add({
      timeMs: Math.round(r.timeMs),
      penalty: r.penalty,
      scramble: item.scramble,
      mode: 'case',
      setId: c.set,
      caseId: c.id,
      auf: item.auf,
      inspectionMs: r.inspectionMs || undefined,
    });
    this.last.set(solve);
    this.explain(solve, before, prior);
    const ch = this.store.lastAutoChange();
    if (ch && ch.caseId === c.id) {
      this.message.update((m) => `${m ? m + ' ' : ''}Status: ${ch.from} → ${ch.to}. ${ch.reason}`);
      if (ch.to === 'finished') this.messageGood.set(true);
    }
  }

  private explain(
    solve: Solve,
    before: { attempts: number; best: number | null; last: number | null },
    prior: Solve[],
  ) {
    this.messageGood.set(false);
    const now = effective(solve);
    if (now === null) {
      this.message.set('DNF');
      return;
    }
    if (before.attempts && before.best !== null) {
      if (now < before.best) {
        this.message.set(
          `New best on this scramble: ${formatTime(before.best - now)} faster than before!`,
        );
        this.messageGood.set(true);
        return;
      }
      this.message.set(`${formatTime(now - before.best)} slower than your best on this scramble.`);
      return;
    }
    const bestCase = best(prior);
    if (bestCase === null) {
      this.message.set('First time you solved this case.');
    } else if (now < bestCase) {
      this.message.set(`New personal best for this case (${formatTime(bestCase - now)} faster).`);
      this.messageGood.set(true);
    }
  }

  async penalty(p: 'plus2' | 'dnf') {
    const l = this.last();
    if (!l) return;
    await this.store.setPenalty(l.id, l.penalty === p ? 'none' : p);
    this.last.set(this.store.solves().find((s) => s.id === l.id) ?? null);
  }

  async remove() {
    const l = this.last();
    if (!l) return;
    await this.store.remove(l.id);
    this.last.set(null);
    this.message.set('');
  }

  retrySame() {
    this.last.set(null);
    this.message.set('');
    this.timer()?.cancel();
  }
}
