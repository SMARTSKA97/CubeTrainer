import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlgService } from '@core/data/alg-service';
import { LearnService } from '@core/data/learn-service';
import { Cube, f2lReport, randomScramble } from '@domain/cube';
import {
  STAGE_NAMES,
  Stage,
  aufFinish,
  aufText,
  crossFrom,
  describePair,
  easiestPair,
  recogniseLl,
  slotLabel,
  stageOf,
} from '@domain/coach';
import { PracticeCube } from '@shared/practice-cube';

/** the four big steps shown on top; every stage of the coach belongs to one */
const BIG: { id: string; name: string; stages: Stage[] }[] = [
  { id: 'cross', name: 'Cross', stages: ['cross'] },
  { id: 'f2l', name: 'F2L', stages: ['f2l'] },
  { id: 'oll', name: 'Yellow face', stages: ['oll-edges', 'oll-corners'] },
  { id: 'pll', name: 'Finish', stages: ['pll-corners', 'pll-edges', 'auf'] },
];

const ORDER = Object.keys(STAGE_NAMES) as Stage[];

const TEACH: Record<Stage, { title: string; body: string }> = {
  cross: {
    title: 'Build the white cross',
    body: 'Put the four white edges on the bottom so each one also matches its side centre. Look at the whole cube first and plan the cross before your first move: good solvers see it in about 8.',
  },
  f2l: {
    title: 'Pair a corner with its edge, then drop them in',
    body: 'Pick a white corner and the side edge that matches it. Get them next to each other in the top layer so they make one block, then slide the block into its gap. Four pairs and two layers are done.',
  },
  'oll-edges': {
    title: 'Make the yellow cross',
    body: 'Look at the yellow stickers on top. A dot, an L or a line? Each has one short algorithm, and every one of them leaves a yellow cross on top.',
  },
  'oll-corners': {
    title: 'Turn the corners yellow',
    body: 'Count the yellow corners that face up. The shape of the unsolved ones tells you which algorithm to use. Most of the time it is Sune or Antisune.',
  },
  'pll-corners': {
    title: 'Put the corners in place',
    body: 'Look for headlights: two corners side by side with the same colour on one face. With headlights, hold them at the back. Without them, the corners are diagonal.',
  },
  'pll-edges': {
    title: 'Cycle the edges',
    body: 'Only the last-layer edges are wrong now. Find a solved side (a bar) and put it at the back: that decides which algorithm and which way it turns.',
  },
  auf: {
    title: 'One last turn',
    body: 'Everything is in place relative to each other. Turn the top layer until it lines up with the sides.',
  },
  done: { title: 'Solved', body: 'The whole cube is solved.' },
};

@Component({
  selector: 'app-coach-page',
  imports: [PracticeCube, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 14px;
    }
    h1 {
      margin: 0;
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }
    .steps span {
      text-align: center;
      font-size: 12.5px;
      padding: 7px 4px;
      border-radius: 10px;
      border: 1px solid var(--line);
      color: var(--muted);
    }
    .steps .now {
      border-color: var(--accent);
      color: var(--text);
      font-weight: 650;
      background: var(--accent-soft);
    }
    .steps .ok {
      color: var(--text);
      opacity: 0.7;
    }
    .coach {
      display: grid;
      gap: 8px;
    }
    .coach h2 {
      margin: 0;
      font-size: 17px;
    }
    .coach p {
      margin: 0;
    }
    .say {
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--panel-2);
      border: 1px solid var(--line);
    }
    .say code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 15px;
      font-weight: 650;
      word-break: break-word;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .sum {
      display: grid;
      gap: 4px;
    }
    .sum div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
  `,
  template: `
    <h1>Coach me</h1>
    <p class="muted">
      A real scramble, solved your way. The coach sees where you are after every move, tells you
      what this part of the solve is for, and shows the answer only when you ask.
    </p>

    <div class="steps" aria-label="Where you are in the solve">
      @for (b of big; track b.id; let i = $index) {
        <span [class.now]="i === bigNow()" [class.ok]="i < bigNow() || stage() === 'done'">
          {{ b.name }}
        </span>
      }
    </div>

    @if (stage() === 'done') {
      <section class="card coach" role="status">
        <h2>Solved. Here is how you did it</h2>
        <div class="sum">
          @for (r of summary(); track r.name) {
            <div>
              <span>{{ r.name }}</span>
              <b>{{ r.moves }} move{{ r.moves === 1 ? '' : 's' }}</b>
            </div>
          }
        </div>
        <div class="row">
          <button class="btn primary" type="button" (click)="another()">New scramble</button>
          <a class="btn" routerLink="/learn">Back to your path</a>
        </div>
      </section>
    } @else {
      <section class="card coach">
        <h2>{{ teach().title }}</h2>
        <p class="muted">{{ teach().body }}</p>
        @if (behind()) {
          <p class="muted">
            Part of the cube looks undone. That is normal in the middle of an algorithm: finish it.
            If you made a slip instead, undo your last moves.
          </p>
        }
        @if (level() > 0 && answer(); as a) {
          <div class="say" role="status">
            @if (a.idea) {
              <p>{{ a.idea }}</p>
            }
            @if (level() > 1 && a.moves) {
              <p>
                Do: <code>{{ a.moves }}</code>
              </p>
            }
          </div>
        }
        <div class="row">
          <button class="btn" type="button" (click)="level.set(1)" [disabled]="level() > 0">
            Give me a hint
          </button>
          <button class="btn" type="button" (click)="level.set(2)" [disabled]="level() > 1">
            Show me the moves
          </button>
        </div>
      </section>
    }

    @for (k of [round()]; track k) {
      <app-practice-cube
        [setup]="scramble()"
        goal="solved"
        [showHint]="false"
        [wide]="true"
        (state)="onState($event)"
        (solved)="finished.set(true); learn.markCoach()"
      />
    }
  `,
})
export class CoachPage {
  private readonly algs = inject(AlgService);
  private readonly learn = inject(LearnService);
  readonly big = BIG;
  readonly round = signal(0);
  readonly scramble = signal(randomScramble(20));
  readonly finished = signal(false);
  /** 0 nothing, 1 the idea, 2 the exact moves */
  readonly level = signal(0);
  private readonly now = signal({ scramble: '', moves: 0 });
  /** moves you had made when each stage ended */
  private readonly marks = signal<Partial<Record<Stage, number>>>({});

  readonly cube = computed(() => new Cube().apply(this.now().scramble || this.scramble()));
  /** where the cube really is right now (an algorithm in the middle of its work looks like a step back) */
  readonly raw = computed(() => stageOf(this.cube()));
  /** the furthest stage reached: it only moves forward, so a half-done algorithm does not reset the coach */
  private readonly reached = signal<Stage>('cross');
  readonly stage = computed(() =>
    ORDER.indexOf(this.raw()) > ORDER.indexOf(this.reached()) ? this.raw() : this.reached(),
  );
  readonly behind = computed(() => ORDER.indexOf(this.raw()) < ORDER.indexOf(this.stage()));
  readonly teach = computed(() => TEACH[this.stage()]);
  readonly bigNow = computed(() => BIG.findIndex((b) => b.stages.includes(this.stage())));

  /** only worked out when asked for: finding the best pair can take a moment */
  readonly answer = computed<{ idea: string; moves: string } | null>(() => {
    if (this.level() === 0) return null;
    const st = this.raw();
    const c = this.cube();
    if (st === 'cross') {
      const m = crossFrom(this.now().scramble || this.scramble());
      return m
        ? { idea: `The shortest cross from here takes ${m.length} moves.`, moves: m.join(' ') }
        : null;
    }
    if (st === 'f2l') {
      const p = easiestPair(c);
      if (!p && !f2lReport(c).crossSolved) {
        const m = crossFrom(this.now().scramble || this.scramble());
        if (m) return { idea: 'The cross has come apart. Put it back first.', moves: m.join(' ') };
      }
      return p
        ? {
            idea: `Easiest pair right now: the ${slotLabel(p.slot)} slot. ${describePair(c, p.slot)} It takes ${p.moves.length} moves.`,
            moves: p.moves.join(' '),
          }
        : {
            idea: 'Try to bring a corner and its edge up into the top layer next to each other.',
            moves: '',
          };
    }
    if (st === 'auf') {
      const f = aufFinish(c);
      return { idea: 'Turn the top layer until the sides match.', moves: f ?? '' };
    }
    const k = recogniseLl(c, st, this.algs.cases());
    if (!k) return null;
    const first = aufText(k.pre);
    return {
      idea: `This is the “${k.name}” case.${first ? ` Turn ${first} first so it lines up.` : ''}`,
      moves: `${first ? first + ' ' : ''}${k.alg}`.trim(),
    };
  });

  onState(s: { scramble: string; moves: number }) {
    const before = this.stage();
    this.now.set(s);
    const after = this.stage();
    if (after !== before) {
      this.reached.set(after);
      this.marks.update((m) => ({ ...m, [before]: s.moves }));
    }
    this.level.set(0);
  }

  readonly summary = computed(() => {
    const m = this.marks();
    let prev = 0;
    const out: { name: string; moves: number }[] = [];
    for (const st of Object.keys(STAGE_NAMES) as Stage[]) {
      const at = m[st];
      if (at === undefined) continue;
      out.push({ name: STAGE_NAMES[st], moves: at - prev });
      prev = at;
    }
    return out.filter((r) => r.moves > 0);
  });

  another() {
    this.scramble.set(randomScramble(20));
    this.marks.set({});
    this.reached.set('cross');
    this.now.set({ scramble: '', moves: 0 });
    this.finished.set(false);
    this.level.set(0);
    this.round.update((n) => n + 1);
  }
}
