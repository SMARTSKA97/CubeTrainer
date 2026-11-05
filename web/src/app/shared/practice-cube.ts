import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Cube, formatMoves, parseMoves, relativeKey } from '@domain/cube';
import { solveCross } from '@domain/cross-solver';
import { GoalId, goalMet } from '@domain/lessons';
import { CROSS_WHITE_HOLD, schemeHex } from '@domain/orientation';
import { ScrambleNet } from './scramble-net';

type Turn = 1 | 2 | 3;
const FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
const SUFFIX: Record<Turn, string> = { 1: '', 2: '2', 3: "'" };

/**
 * A cube drawn on screen that you turn with buttons, with the goal checked for you. The cube is held
 * with white on the bottom. Everything is derived from the starting moves plus the moves you made,
 * so Undo and Reset are exact.
 */
@Component({
  selector: 'app-practice-cube',
  imports: [ScrambleNet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 12px;
    }
    .view {
      max-width: 420px;
      width: 100%;
      margin-inline: auto;
    }
    .hold {
      text-align: center;
      font-size: 12.5px;
      color: var(--muted);
    }
    .keys {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
    }
    .mode {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    button.k,
    button.m {
      min-height: 48px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      font: inherit;
      font-size: 19px;
      font-weight: 650;
      cursor: pointer;
    }
    button.k:active {
      background: var(--accent-soft);
    }
    button.m {
      font-size: 14px;
      font-weight: 500;
      color: var(--muted);
      min-height: 40px;
    }
    button.m.on {
      color: var(--text);
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .done {
      min-height: 36px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 15px;
    }
    .done .mv {
      padding: 2px 8px;
      border-radius: 8px;
      background: var(--bg);
    }
    .done .hint-text {
      color: var(--muted);
      font-family: inherit;
    }
    .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .row .btn {
      flex: 1 1 90px;
    }
    .msg {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 14px;
      border: 1px solid var(--line);
      background: var(--bg);
    }
    .msg.good {
      color: var(--good);
      border-color: color-mix(in srgb, var(--good) 55%, transparent);
    }
    .msg.warn {
      color: var(--warn);
      border-color: color-mix(in srgb, var(--warn) 55%, transparent);
    }
    .count {
      color: var(--muted);
      font-size: 13px;
      margin-left: auto;
    }
  `,
  template: `
    <div class="view"><app-scramble-net [scramble]="scramble()" [scheme]="scheme" /></div>
    <div class="hold">
      White is on the bottom, yellow on top. The unfolded view shows every face.
    </div>

    <div class="done" aria-label="Your moves" aria-live="polite">
      @for (m of moves(); track $index) {
        <span class="mv">{{ m }}</span>
      } @empty {
        <span class="hint-text">Pick a direction, then tap a face to turn it.</span>
      }
    </div>

    <div class="mode" role="group" aria-label="Direction">
      <button type="button" class="m" [class.on]="turn() === 1" (click)="turn.set(1)">
        Clockwise
      </button>
      <button type="button" class="m" [class.on]="turn() === 3" (click)="turn.set(3)">
        Anticlockwise
      </button>
      <button type="button" class="m" [class.on]="turn() === 2" (click)="turn.set(2)">
        Half turn
      </button>
    </div>
    <div class="keys" role="group" aria-label="Faces">
      @for (f of faces; track f) {
        <button type="button" class="k" [disabled]="ok()" (click)="press(f)">
          {{ f }}{{ suffix() }}
        </button>
      }
    </div>

    <div class="row">
      <button class="btn" type="button" (click)="undo()" [disabled]="!moves().length">Undo</button>
      <button class="btn" type="button" (click)="reset()" [disabled]="!moves().length">
        Reset
      </button>
      <button
        class="btn"
        type="button"
        (click)="hint.update((h) => Math.min(2, h + 1))"
        [disabled]="ok()"
      >
        Hint
      </button>
      <span class="count">{{ count() }} move{{ count() === 1 ? '' : 's' }}</span>
    </div>

    @if (hintText()) {
      <p class="msg" role="status">{{ hintText() }}</p>
    }
    @if (ok()) {
      <p class="msg good" role="status">
        Done in {{ count() }} move{{ count() === 1 ? '' : 's' }}.
        @if (best() !== null && best()! < count()) {
          The shortest is {{ best() }}.
        }
      </p>
    } @else if (met() && limit() !== null) {
      <p class="msg warn" role="status">
        Solved, but in {{ count() }} moves. The target is {{ limit() }} or fewer. Undo and look for
        a shorter way.
      </p>
    }
  `,
})
export class PracticeCube {
  /** moves that build the starting position from a solved cube */
  readonly setup = input('');
  readonly goal = input<GoalId>('solved');
  /** for goal 'match': moves that make the cube you have to reach */
  readonly target = input('');
  /** a way to the goal, from the start, for the hint (defaults to undoing the setup) */
  readonly solution = input('');
  /** let the cross solver work out the hint from where you are now */
  readonly crossHint = input(false);
  /** the goal only counts in this many moves or fewer */
  readonly limit = input<number | null>(null);
  /** known shortest length, only for the message */
  readonly best = input<number | null>(null);
  /** a case: done when the cube is as if the given algorithm had been done on the starting position */
  readonly alg = input('');
  readonly solved = output<{ moves: number }>();

  readonly scheme = schemeHex(CROSS_WHITE_HOLD);
  readonly faces = FACES;
  readonly Math = Math;
  readonly turn = signal<Turn>(1);
  readonly suffix = computed(() => SUFFIX[this.turn()]);
  readonly moves = signal<string[]>([]);
  readonly hint = signal(0);
  private emitted = false;

  readonly scramble = computed(() => [this.setup(), ...this.moves()].join(' ').trim());
  readonly cube = computed(() => new Cube().apply(this.scramble()));
  readonly count = computed(() => this.moves().length);

  readonly met = computed(() => {
    if (this.alg())
      return (
        relativeKey(this.cube()) ===
        relativeKey(new Cube().apply(`${this.setup()} ${this.alg()}`.trim()))
      );
    const target = this.target() ? new Cube().apply(this.target()) : undefined;
    return goalMet(this.goal(), this.cube(), target);
  });
  readonly ok = computed(
    () => this.met() && (this.limit() === null || this.count() <= this.limit()!),
  );

  /** what the hint says: the next move first, the whole way on a second press */
  readonly hintText = computed(() => {
    const h = this.hint();
    if (!h || this.ok()) return '';
    const way = this.crossHint() ? this.crossWay() : this.fixedWay();
    if (typeof way === 'string')
      return h === 1 ? 'You are off the usual way. Undo, or Reset, and start again.' : way;
    if (!way) return 'No hint available.';
    if (!way.length) return 'Nothing left to do.';
    return h === 1 ? `Next move: ${way[0]}` : `From here: ${way.join(' ')}`;
  });

  private crossWay(): string[] | null {
    return solveCross(this.scramble(), 'D')?.moves ?? null;
  }

  /** the rest of the written solution, or the whole of it (as text) when you have gone a different way */
  private fixedWay(): string[] | string {
    const sol = this.solution() || this.alg();
    const all = sol ? formatMoves(parseMoves(sol)).split(' ') : [];
    const mine = this.moves();
    return mine.every((m, i) => all[i] === m)
      ? all.slice(mine.length)
      : `From the start: ${all.join(' ')}`;
  }

  constructor() {
    // a new position starts clean
    effect(() => {
      this.setup();
      this.goal();
      this.target();
      this.alg();
      untracked(() => this.reset());
    });
    effect(() => {
      if (this.ok() && !this.emitted) {
        this.emitted = true;
        const moves = untracked(() => this.count());
        this.solved.emit({ moves });
      }
    });
  }

  press(face: string) {
    if (this.ok()) return;
    this.moves.update((m) => [...m, face + SUFFIX[this.turn()]]);
    this.hint.set(0);
  }
  undo() {
    this.moves.update((m) => m.slice(0, -1));
    this.hint.set(0);
  }
  reset() {
    this.moves.set([]);
    this.hint.set(0);
    this.emitted = false;
  }
}
