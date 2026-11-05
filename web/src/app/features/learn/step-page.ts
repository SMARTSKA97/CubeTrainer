import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AlgService } from '@core/data/alg-service';
import { LearnService } from '@core/data/learn-service';
import { SolveStore } from '@core/data/solve-store';
import { invertAlg } from '@domain/cube';
import { BATCH, LEVELS, LEVEL_IDS, Step, activeBatch } from '@domain/levels';
import { chunkAlg, recallState } from '@domain/memory';
import { CROSS_WHITE_HOLD, schemeHex } from '@domain/orientation';
import { CasePic } from '@shared/case-pic';
import { MovePlayer } from '@shared/move-player';
import { RecallCard, RecallResult } from '@shared/recall-card';
import { LessonRunner } from './lesson-runner';
import { PracticeCube } from '@shared/practice-cube';

type Phase = 'intro' | 'learn' | 'recall' | 'done';

@Component({
  selector: 'app-step-page',
  imports: [RouterLink, CasePic, MovePlayer, RecallCard, LessonRunner, PracticeCube],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: var(--gap);
      max-width: 760px;
      margin: 0 auto;
      width: 100%;
    }
    h1,
    h2,
    h3,
    p {
      margin: 0;
    }
    .back {
      color: var(--muted);
      font-size: 14px;
      text-decoration: none;
    }
    .muted {
      color: var(--muted);
      font-size: 14px;
    }
    .card {
      display: grid;
      gap: 12px;
    }
    .sec {
      display: grid;
      gap: 6px;
    }
    .sec ul {
      margin: 0;
      padding-left: 20px;
      display: grid;
      gap: 4px;
    }
    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .dots {
      display: flex;
      gap: 6px;
    }
    .dots i {
      width: 28px;
      height: 6px;
      border-radius: 99px;
      background: var(--panel-2);
    }
    .dots i.on {
      background: var(--accent);
    }
    .dots i.ok {
      background: var(--good);
    }
    .case {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .case app-case-pic {
      --pic: 120px;
    }
    .chunks {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chunk {
      display: grid;
      gap: 2px;
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--panel-2);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 600;
      font-size: 17px;
    }
    .chunk small {
      font-family: system-ui, sans-serif;
      font-weight: 400;
      color: var(--muted);
      font-size: 12px;
    }
    .tips {
      display: grid;
      gap: 4px;
      padding-left: 18px;
      margin: 0;
      font-size: 14px;
      color: var(--muted);
    }
    summary {
      cursor: pointer;
    }
    .list {
      display: grid;
      gap: 6px;
    }
    .item {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 8px 10px;
      border-radius: 12px;
      background: var(--bg);
    }
    .item app-case-pic {
      --pic: 52px;
    }
    .tag {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 99px;
      border: 1px solid var(--line);
      color: var(--muted);
      white-space: nowrap;
    }
    .tag.good {
      color: var(--good);
      border-color: color-mix(in srgb, var(--good) 50%, transparent);
    }
    .tag.accent {
      color: var(--accent);
      border-color: var(--accent);
    }
    .bar {
      height: 8px;
      border-radius: 99px;
      background: var(--bg);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      background: var(--good);
    }
  `,
  template: `
    <a class="back" routerLink="/learn">&larr; Your path</a>
    @if (step(); as s) {
      <h1>{{ s.title }}</h1>

      @switch (s.kind) {
        @case ('lesson') {
          <app-lesson-runner [step]="$any(s)" />
        }
        @case ('solves') {
          <section class="card">
            <p>
              Solve a scrambled cube {{ $any(s).need }} times in under
              {{ $any(s).maxMs / 1000 }} seconds each. Only solves from the Timer count, made since
              you started this level.
            </p>
            <div class="bar" aria-hidden="true">
              <i [style.width.%]="(100 * count()) / $any(s).need"></i>
            </div>
            <p class="muted">{{ count() }} of {{ $any(s).need }} so far</p>
            <div class="row">
              <a class="btn primary" routerLink="/timer">Open the timer</a>
              <a class="btn" routerLink="/learn">Back to your path</a>
            </div>
          </section>
        }
        @case ('cases') {
          <section class="card">
            <p>{{ $any(s).intro }}</p>
          </section>

          @switch (phase()) {
            @case ('intro') {
              <section class="card">
                @if (!ids().length) {
                  <p class="muted">Loading the algorithms…</p>
                } @else if (!batch().length) {
                  <h2>Every algorithm here is remembered</h2>
                  <p class="muted">
                    They come back for short memory checks on a schedule. Practise them against the
                    clock in the Case trainer to make them fast.
                  </p>
                  <div class="row">
                    <a
                      class="btn primary"
                      [routerLink]="['/trainer']"
                      [queryParams]="{ set: $any(s).setId }"
                    >
                      Practise for speed
                    </a>
                    <a class="btn" routerLink="/learn">Back to your path</a>
                  </div>
                } @else if (!today().length) {
                  <h2>That is enough new material for today</h2>
                  <p class="muted">
                    You have taken in {{ learn.newToday() }} new algorithms today. Sleeping on them
                    is what makes them stick; come back tomorrow for the next ones. Any memory
                    checks that are due will wait for you on the Today page.
                  </p>
                  <div class="row">
                    <a class="btn primary" routerLink="/today">Go to Today</a>
                    <a class="btn" routerLink="/learn">Back to your path</a>
                  </div>
                } @else {
                  <h2>
                    Learn {{ today().length }}
                    {{ today().length === 1 ? 'algorithm' : 'algorithms' }}
                  </h2>
                  <p class="muted">
                    Three small rounds: look at each one, type them from memory, then they return on
                    a schedule so they stay.
                  </p>
                  <div class="list">
                    @for (c of today(); track c.id) {
                      <div class="item">
                        <app-case-pic [c]="c" />
                        <div>
                          {{ c.name }}
                          <div class="muted">{{ c.group }}</div>
                        </div>
                        <span class="tag">{{ stateLabel(c.id) }}</span>
                      </div>
                    }
                  </div>
                  <div class="row">
                    <button class="btn primary" type="button" (click)="begin()">
                      Start learning
                    </button>
                    <button class="btn" type="button" (click)="skipToRecall()">
                      I know these: skip to the memory check
                    </button>
                  </div>
                }
              </section>
            }
            @case ('learn') {
              @if (current(); as c) {
                <section class="card">
                  <div class="row">
                    <div class="dots" aria-hidden="true">
                      @for (x of session(); track x; let i = $index) {
                        <i [class.on]="i === idx()" [class.ok]="i < idx()"></i>
                      }
                    </div>
                    <span class="muted">Look {{ idx() + 1 }} of {{ session().length }}</span>
                  </div>
                  <div class="case">
                    <app-case-pic [c]="c" />
                    <div>
                      <h2>{{ c.name }}</h2>
                      <div class="muted">{{ c.group }}</div>
                    </div>
                  </div>
                  <div class="chunks" aria-label="The algorithm in pieces">
                    @for (k of chunks(); track $index) {
                      <span class="chunk">
                        {{ k.moves }}
                        @if (k.hook) {
                          <small>{{ k.hook }}</small>
                        }
                      </span>
                    }
                  </div>
                  <ul class="tips">
                    <li>Say the pieces out loud: the rhythm is what you remember.</li>
                    <li>Watch it once, then try it on your own cube before moving on.</li>
                  </ul>
                  <app-move-player
                    [moves]="c.alg"
                    [stages]="c.stages ?? null"
                    [start]="inverse(c.alg)"
                    [scheme]="scheme"
                    [learn]="true"
                  />
                  <div class="row">
                    <button class="btn" type="button" (click)="tryIt.set(!tryIt())">
                      {{ tryIt() ? 'Hide the practice cube' : 'Try it on the screen' }}
                    </button>
                  </div>
                  @if (tryIt()) {
                    @for (k of [c.id]; track k) {
                      <p class="muted">
                        Do the algorithm yourself. The cube starts in the case; you are done when it
                        is solved.
                      </p>
                      <app-practice-cube
                        [setup]="c.setup ?? inverse(c.alg)"
                        [alg]="c.alg"
                        goal="solved"
                        [solution]="c.alg"
                      />
                    }
                  }
                  <div class="row">
                    <button class="btn primary" type="button" (click)="nextLook()">
                      {{
                        idx() + 1 < session().length ? 'Next algorithm' : 'Start the memory check'
                      }}
                    </button>
                  </div>
                </section>
              }
            }
            @case ('recall') {
              <section class="card">
                <div class="row">
                  <span class="muted">Type it from memory. {{ queue().length }} left.</span>
                </div>
                @for (k of [round()]; track k) {
                  @if (queue()[0]; as id) {
                    @if (algs.byId().get(id); as c) {
                      <app-recall-card [c]="c" (done)="answered(id, $event)" />
                    }
                  }
                }
              </section>
            }
            @case ('done') {
              <section class="card">
                <h2>{{ remembered() }} of {{ session().length }} remembered</h2>
                <p class="muted">
                  They come back for a short memory check tomorrow, then after 3, 7, 14 and 30 days.
                  Each time you get one right, the gap grows.
                </p>
                <div class="row">
                  @if (batch().length && learn.newLeft() > 0) {
                    <button class="btn primary" type="button" (click)="again()">
                      Learn the next ones
                    </button>
                  }
                  <a
                    class="btn"
                    [class.primary]="!batch().length || learn.newLeft() === 0"
                    [routerLink]="['/trainer']"
                    [queryParams]="{ focus: session()[0] }"
                  >
                    Practise for speed
                  </a>
                  <a class="btn" routerLink="/learn">Back to your path</a>
                </div>
              </section>
            }
          }

          @if (ids().length) {
            <details class="card" [open]="ids().length <= 6">
              <summary>
                <b>All {{ ids().length }} algorithms in this step</b>
              </summary>
              <div class="list">
                @for (c of cases(); track c.id) {
                  <div class="item">
                    <app-case-pic [c]="c" />
                    <div>
                      {{ c.name }}
                      <div class="muted">{{ c.group }}</div>
                    </div>
                    <span
                      class="tag"
                      [class.good]="fast(c.id)"
                      [class.accent]="!fast(c.id) && state(c.id) !== 'new'"
                    >
                      {{ fast(c.id) ? 'fast' : stateLabel(c.id) }}
                    </span>
                  </div>
                }
              </div>
            </details>
          }
        }
      }
    } @else {
      <section class="card">
        <p>That step does not exist.</p>
        <a class="btn" routerLink="/learn">Back to your path</a>
      </section>
    }
  `,
})
export class StepPage {
  readonly learn = inject(LearnService);
  readonly algs = inject(AlgService);
  private readonly store = inject(SolveStore);
  private readonly route = inject(ActivatedRoute);

  readonly scheme = schemeHex(CROSS_WHITE_HOLD);
  inverse = invertAlg;

  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: '',
  });
  readonly step = computed<Step | null>(() => {
    for (const l of LEVEL_IDS) {
      const s = LEVELS[l].steps.find((x) => x.id === this.id());
      if (s) return s;
    }
    return null;
  });
  private readonly row = computed(() => {
    for (const l of LEVEL_IDS) {
      const r = this.learn.rows()[l].find((x) => x.step.id === this.id());
      if (r) return r;
    }
    return null;
  });
  readonly done = computed(() => !!this.row()?.done);
  readonly count = computed(() => this.row()?.count ?? 0);

  // ---- cases ------------------------------------------------------------------------------------
  readonly ids = computed(() => {
    const s = this.step();
    return s?.kind === 'cases' ? this.learn.caseIds(s) : [];
  });
  readonly cases = computed(() =>
    this.ids()
      .map((id) => this.algs.byId().get(id)!)
      .filter(Boolean),
  );
  /** the group of three to work on now */
  readonly batch = computed(() =>
    activeBatch(this.ids(), this.learn.memory(), BATCH, (id) => this.learn.isKnown(id)),
  );
  /** the part of it that fits today's limit on new algorithms (ones already seen always do) */
  readonly today = computed(() => {
    const mem = this.learn.memory();
    let fresh = this.learn.newLeft();
    const out = [];
    for (const id of this.batch()) {
      if (mem[id]) out.push(id);
      else if (fresh > 0) {
        fresh--;
        out.push(id);
      }
    }
    return out.map((id) => this.algs.byId().get(id)!).filter(Boolean);
  });

  readonly phase = signal<Phase>('intro');
  readonly tryIt = signal(false);
  readonly session = signal<string[]>([]);
  readonly idx = signal(0);
  readonly queue = signal<string[]>([]);
  readonly round = signal(0);
  private readonly passed = signal<string[]>([]);
  readonly remembered = computed(() => this.passed().length);
  readonly current = computed(() => this.algs.byId().get(this.session()[this.idx()] ?? ''));
  readonly chunks = computed(() => chunkAlg(this.current()?.alg ?? ''));

  state = (id: string) => recallState(this.learn.memory()[id]);
  fast = (id: string) => this.store.status()[id] === 'finished';
  stateLabel(id: string): string {
    return { new: 'new', seen: 'seen', recalled: 'remembered', solid: 'solid' }[this.state(id)];
  }

  begin() {
    this.session.set(this.today().map((c) => c.id));
    this.passed.set([]);
    this.idx.set(0);
    this.phase.set('learn');
    this.learn.see(this.session()[0]);
  }
  skipToRecall() {
    this.session.set(this.today().map((c) => c.id));
    this.passed.set([]);
    for (const id of this.session()) this.learn.see(id);
    this.startRecall();
  }
  nextLook() {
    this.tryIt.set(false);
    if (this.idx() + 1 < this.session().length) {
      this.idx.update((i) => i + 1);
      this.learn.see(this.session()[this.idx()]);
    } else this.startRecall();
  }
  private startRecall() {
    this.queue.set([...this.session()]);
    this.round.update((n) => n + 1);
    this.phase.set('recall');
  }
  answered(id: string, r: RecallResult) {
    const ok = r.ok && !r.hinted;
    this.learn.recall(id, ok);
    if (ok) this.passed.update((l) => [...l, id]);
    this.queue.update((q) => (ok ? q.slice(1) : [...q.slice(1), id]));
    this.round.update((n) => n + 1);
    if (!this.queue().length) this.phase.set('done');
  }
  again() {
    this.phase.set('intro');
  }
}
