import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AlgService } from '@core/data/alg-service';
import { LearnService } from '@core/data/learn-service';
import { invertAlg } from '@domain/cube';
import { LessonStep } from '@domain/levels';
import { Page, crossSetup } from '@domain/lessons';
import { CROSS_WHITE_HOLD, schemeHex } from '@domain/orientation';
import { MovePlayer } from '@shared/move-player';
import { PracticeCube } from '@shared/practice-cube';

interface Drill {
  setup: string;
  solution?: string;
  alg?: string;
  best: number | null;
  limit: number | null;
}

/** Plays a lesson page by page: explanations with a demonstration, and practice that is checked. */
@Component({
  selector: 'app-lesson-runner',
  imports: [RouterLink, MovePlayer, PracticeCube],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: var(--gap);
    }
    h2,
    p {
      margin: 0;
    }
    .card {
      display: grid;
      gap: 14px;
    }
    .dots {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    }
    .dots i {
      width: 22px;
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
    .body {
      display: grid;
      gap: 10px;
      line-height: 1.55;
    }
    .body ul {
      margin: 0;
      padding-left: 20px;
      display: grid;
      gap: 6px;
    }
    .cap {
      color: var(--muted);
      font-size: 13.5px;
    }
    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .skip {
      font-size: 13.5px;
      color: var(--muted);
      background: none;
      border: 0;
      text-decoration: underline;
      cursor: pointer;
      font: inherit;
      padding: 4px 0;
    }
    .task {
      font-weight: 600;
    }
    .after {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--good) 55%, transparent);
      color: var(--good);
      font-size: 14px;
    }
  `,
  template: `
    <section class="card">
      <div class="row">
        <div class="dots" aria-hidden="true">
          @for (p of pages(); track $index) {
            <i
              [class.on]="$index === i()"
              [class.ok]="$index < i() || passed().includes($index)"
            ></i>
          }
        </div>
        <span class="cap">Page {{ i() + 1 }} of {{ pages().length }}</span>
      </div>

      @if (page(); as pg) {
        <h2>{{ pg.title }}</h2>
        @if (blocks().length) {
          <div class="body">
            @for (b of blocks(); track $index) {
              @if (b.list) {
                <ul>
                  @for (l of b.list; track $index) {
                    <li>{{ l }}</li>
                  }
                </ul>
              } @else {
                <p>{{ b.text }}</p>
              }
            }
          </div>
        }
        @if (demo(); as d) {
          <button class="btn" type="button" (click)="watch.set(!watch())">
            {{ watch() ? 'Hide the demonstration' : 'Watch it' }}
          </button>
          @if (watch()) {
            <app-move-player [moves]="d.moves" [start]="d.start" [scheme]="scheme" />
            @if (d.caption) {
              <p class="cap">{{ d.caption }}</p>
            }
          }
        }
        @if (pg.practice; as pr) {
          <p class="task">{{ pr.prompt }}</p>
          @if (drill(); as d) {
            @for (k of [attempt()]; track k) {
              <app-practice-cube
                [setup]="d.setup"
                [goal]="pr.goal"
                [target]="pr.target ?? ''"
                [solution]="d.solution ?? ''"
                [crossHint]="pr.randomCross !== undefined"
                [limit]="d.limit"
                [best]="d.best"
                (solved)="pass()"
              />
            }
          }
          @if (passed().includes(i())) {
            @if (pr.after; as a) {
              <p class="after" role="status">{{ a }}</p>
            }
          } @else {
            <div class="row">
              @if (pr.randomCross !== undefined) {
                <button class="skip" type="button" (click)="another()">
                  Try a different scramble
                </button>
              }
              <button class="skip" type="button" (click)="pass()">
                I can do this on my own cube: skip
              </button>
            </div>
          }
        }
      }

      <div class="row">
        <button class="btn" type="button" (click)="back()" [disabled]="i() === 0">Back</button>
        <button class="btn primary" type="button" (click)="next()" [disabled]="!canNext()">
          {{ last() ? 'Finish' : 'Next' }}
        </button>
        <a class="btn" routerLink="/learn">Leave</a>
      </div>
    </section>
  `,
})
export class LessonRunner {
  readonly step = input.required<LessonStep>();
  private readonly algs = inject(AlgService);
  private readonly learn = inject(LearnService);
  private readonly router = inject(Router);

  readonly scheme = schemeHex(CROSS_WHITE_HOLD);
  readonly i = signal(0);
  readonly passed = signal<number[]>([]);
  readonly attempt = signal(0);
  /** the demonstration is hidden until asked for: the page stays short */
  readonly watch = signal(false);
  private readonly generated = signal<Record<number, ReturnType<typeof crossSetup>>>({});

  readonly pages = computed<Page[]>(() => this.step().pages);
  readonly page = computed(() => this.pages()[this.i()]);
  readonly last = computed(() => this.i() === this.pages().length - 1);

  readonly blocks = computed(() => {
    const body = this.page()?.body;
    if (!body) return [];
    return body.split('\n\n').map((b) => {
      const lines = b.split('\n');
      return lines.every((l) => l.startsWith('- '))
        ? { text: '', list: lines.map((l) => l.slice(2)) }
        : { text: b, list: null as string[] | null };
    });
  });

  readonly demo = computed(() => {
    const d = this.page()?.demo;
    if (!d) return null;
    if (d.caseId) {
      const c = this.algs.byId().get(d.caseId);
      return c ? { moves: c.alg, start: c.setup ?? invertAlg(c.alg), caption: d.caption } : null;
    }
    return { moves: d.moves, start: d.setup ?? '', caption: d.caption };
  });

  readonly drill = computed<Drill | null>(() => {
    const t = this.page()?.practice;
    if (!t) return null;
    if (t.randomCross !== undefined) {
      const g = this.generated()[this.i()];
      return g
        ? {
            setup: g.setup,
            solution: g.solution,
            best: g.best,
            limit: (t.extraMoves ?? 99) >= 99 ? null : g.best + (t.extraMoves ?? 0),
          }
        : null;
    }
    if (t.caseId) {
      const c = this.algs.byId().get(t.caseId);
      return c
        ? { setup: c.setup ?? invertAlg(c.alg), solution: c.alg, best: null, limit: null }
        : null;
    }
    return { setup: t.setup ?? '', solution: t.solution, best: null, limit: null };
  });

  readonly canNext = computed(() => {
    return (
      !this.page()?.practice ||
      this.passed().includes(this.i()) ||
      this.learn.stepsDone().includes(this.step().id)
    );
  });

  constructor() {
    queueMicrotask(() => this.prepare());
  }

  private prepare() {
    const k = this.page()?.practice?.randomCross;
    if (k !== undefined && !this.generated()[this.i()])
      this.generated.update((g) => ({ ...g, [this.i()]: crossSetup(k) }));
  }

  pass() {
    if (!this.passed().includes(this.i())) this.passed.update((p) => [...p, this.i()]);
  }
  another() {
    const k = this.page()?.practice?.randomCross;
    if (k === undefined) return;
    this.generated.update((g) => ({ ...g, [this.i()]: crossSetup(k) }));
    this.attempt.update((n) => n + 1);
  }
  back() {
    if (this.i() > 0) {
      this.i.update((n) => n - 1);
      this.attempt.update((n) => n + 1);
      this.watch.set(false);
    }
  }
  next() {
    if (this.last()) {
      this.learn.markStep(this.step().id, true);
      void this.router.navigateByUrl('/learn');
      return;
    }
    this.i.update((n) => n + 1);
    this.attempt.update((n) => n + 1);
    this.watch.set(false);
    this.prepare();
  }
}
