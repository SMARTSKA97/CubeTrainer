import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  Cube,
  Face,
  Move,
  Sticker,
  describeMove,
  formatMove,
  moveSpec,
  parseMoves,
  stateAfter,
} from '@domain/cube';
import { Chunk, chunkAlg, insightsFor } from '@domain/patterns';
import { Cube3d, ActiveTurn } from './cube-3d';

type Speed = 0.5 | 1 | 2;
const HIGHLIGHT_MS = 300;
const TURN_MS = 600;
const REST_MS = 100;

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/**
 * Plays a list of moves on a 3D cube: each second the next move is highlighted (everything else goes
 * grey) and then turns. Play, pause, step either way, jump to any move, change speed. With `learn` it
 * also cuts the moves into named chunks and explains their structure.
 */
@Component({
  selector: 'app-move-player',
  imports: [Cube3d],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="player">
      <app-cube-3d
        [stickers]="stickers()"
        [scheme]="scheme()"
        [active]="active()"
        [focus]="focus()"
      />

      <div class="now" aria-live="polite">
        @if (current(); as m) {
          <b class="big">{{ label(m) }}</b>
          <span class="muted">{{ describe(m) }}</span>
        } @else if (total() === 0) {
          <span class="muted">Nothing to play</span>
        } @else {
          <b class="big done">Done</b>
          <span class="muted">{{ doneText() }}</span>
        }
      </div>

      <div class="bar" role="group" aria-label="Playback">
        <button class="ic" type="button" (click)="restart()" aria-label="Back to the start">
          <svg viewBox="0 0 24 24"><path d="M6 5v14M19 5l-9 7 9 7z" /></svg>
        </button>
        <button
          class="ic"
          type="button"
          (click)="stepBack()"
          [disabled]="pos() === 0 || busy()"
          aria-label="Previous move"
        >
          <svg viewBox="0 0 24 24"><path d="M15 5l-8 7 8 7z" /></svg>
        </button>
        <button
          class="ic play"
          type="button"
          (click)="toggle()"
          [attr.aria-label]="playing() ? 'Pause' : 'Play'"
        >
          @if (playing()) {
            <svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" /></svg>
          } @else {
            <svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" /></svg>
          }
        </button>
        <button
          class="ic"
          type="button"
          (click)="stepForward()"
          [disabled]="pos() >= total() || busy()"
          aria-label="Next move"
        >
          <svg viewBox="0 0 24 24"><path d="M9 5l8 7-8 7z" /></svg>
        </button>
        <span class="count">{{ pos() }} / {{ total() }}</span>
        <span class="grow"></span>
        <button class="chip" type="button" (click)="cycleSpeed()" aria-label="Change speed">
          {{ speed() }}×
        </button>
        <button
          class="chip"
          type="button"
          [class.on]="focus()"
          (click)="focus.set(!focus())"
          aria-label="Grey out everything except the moving layer"
        >
          Focus
        </button>
      </div>

      <div class="moves" [class.live]="playing() || busy()">
        @for (c of chunks(); track c.from) {
          <div class="chunk" [class.on]="inChunk(c)" [class.named]="!!c.name">
            @if (learn() && c.name) {
              <button class="cname" type="button" (click)="playChunk(c)" [title]="c.tip ?? ''">
                {{ c.name }} <span aria-hidden="true">▶</span>
              </button>
            }
            <span class="seq">
              @for (i of range(c); track i) {
                <button
                  type="button"
                  class="mv"
                  [class.done]="i < pos()"
                  [class.cur]="i === pos() && (playing() || busy())"
                  [class.next]="i === pos() && !(playing() || busy())"
                  [class.hid]="hide() && i >= pos()"
                  (click)="jump(i)"
                  [attr.aria-label]="'Go to move ' + (i + 1) + ', ' + label(list()[i])"
                >
                  {{ hide() && i >= pos() ? '•' : label(list()[i]) }}
                </button>
              }
            </span>
          </div>
        }
      </div>

      @if (learn()) {
        <div class="tools">
          <button class="chip" type="button" [class.on]="hide()" (click)="hide.set(!hide())">
            {{ hide() ? 'Show moves' : 'Recall: hide moves' }}
          </button>
        </div>
        @if (tip(); as t) {
          <p class="tip">
            <b>{{ t.name }}.</b> {{ t.tip }}
          </p>
        }
        @if (insights().length) {
          <ul class="insights">
            @for (i of insights(); track i.title) {
              <li>
                <b>{{ i.title }}</b>
                <span>{{ i.text }}</span>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .player {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
      justify-items: stretch;
      min-width: 0;
    }
    .now {
      display: grid;
      gap: 2px;
      justify-items: center;
      text-align: center;
      min-height: 3.1em;
    }
    .big {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--accent);
      font-variant-numeric: tabular-nums;
    }
    .big.done {
      color: var(--good);
    }
    .now .muted {
      font-size: 13.5px;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px;
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 18px;
    }
    .ic {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 14px;
      background: none;
      color: var(--text);
      cursor: pointer;
    }
    .ic:hover:not(:disabled) {
      background: var(--panel-2);
    }
    .ic:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .ic svg {
      width: 22px;
      height: 22px;
      fill: currentColor;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .ic.play {
      width: 52px;
      background: var(--accent);
      color: #0a0d16;
    }
    .ic.play:hover {
      background: #98b3ff;
    }
    .count {
      margin-left: 6px;
      font-size: 13px;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .grow {
      flex: 1;
    }
    .chip {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--muted);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      padding: 7px 12px;
      border-radius: 999px;
      cursor: pointer;
      white-space: nowrap;
    }
    .chip.on {
      color: var(--text);
      background: var(--accent-soft);
      border-color: rgba(124, 156, 255, 0.45);
    }
    .moves {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 8px;
      align-items: flex-end;
    }
    .chunk {
      display: grid;
      gap: 4px;
      padding: 6px 8px 8px;
      border-radius: 14px;
      border: 1px solid transparent;
      min-width: 0;
    }
    .chunk.named {
      background: var(--panel-2);
      border-color: var(--line);
    }
    .chunk.on {
      border-color: rgba(124, 156, 255, 0.55);
    }
    .cname {
      border: 0;
      background: none;
      padding: 0;
      font: inherit;
      font-size: 11.5px;
      font-weight: 650;
      letter-spacing: 0.02em;
      color: var(--muted);
      text-align: left;
      cursor: pointer;
    }
    .cname span {
      color: var(--accent);
      font-size: 9px;
    }
    .seq {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .mv {
      min-width: 38px;
      height: 38px;
      padding: 0 8px;
      border: 1px solid var(--line);
      border-radius: 11px;
      background: var(--bg);
      color: var(--text);
      font: inherit;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition:
        background 0.15s,
        color 0.15s,
        opacity 0.15s,
        transform 0.15s;
    }
    .mv.done {
      color: var(--muted);
    }
    .mv.next {
      border-color: rgba(124, 156, 255, 0.6);
    }
    .mv.cur {
      background: var(--accent);
      border-color: var(--accent);
      color: #0a0d16;
      transform: scale(1.1);
    }
    .mv.hid {
      color: var(--muted);
    }
    /* While it plays, only the move being made stays lit; everything else steps back. */
    .moves.live .mv:not(.cur) {
      opacity: 0.32;
    }
    .tools {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tip {
      font-size: 14px;
      color: var(--muted);
      padding: 10px 12px;
      background: var(--accent-soft);
      border-radius: 12px;
    }
    .tip b {
      color: var(--text);
    }
    .insights {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .insights li {
      display: grid;
      gap: 2px;
      font-size: 13.5px;
      color: var(--muted);
      padding: 10px 12px;
      border: 1px solid var(--line-soft);
      border-radius: 12px;
    }
    .insights b {
      color: var(--text);
      font-size: 13.5px;
    }
  `,
})
export class MovePlayer implements OnDestroy {
  /** the moves to play, e.g. a scramble or an algorithm */
  readonly moves = input.required<string>();
  /** moves that set up the starting position from a solved cube (empty = start solved) */
  readonly start = input('');
  readonly scheme = input<Record<Face, string> | null>(null);
  /** show named chunks, structure notes and the recall mode */
  readonly learn = input(false);

  readonly list = computed<Move[]>(() => {
    try {
      return parseMoves(this.moves());
    } catch {
      return [];
    }
  });
  readonly total = computed(() => this.list().length);
  readonly chunks = computed<Chunk[]>(() =>
    this.learn()
      ? chunkAlg(this.list())
      : this.list().map((_, i) => ({ from: i, to: i + 1, repeat: 1 })),
  );
  readonly insights = computed(() => insightsFor(this.list()));

  readonly stickers = signal<Sticker[]>([]);
  readonly pos = signal(0);
  readonly playing = signal(false);
  readonly speed = signal<Speed>(1);
  readonly focus = signal(true);
  readonly hide = signal(false);
  /** the move being animated right now (null between moves) */
  private readonly turn = signal<ActiveTurn | null>(null);
  private readonly phase = signal<'idle' | 'highlight' | 'turn'>('idle');
  readonly busy = computed(() => this.phase() !== 'idle');

  private cube = new Cube();
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopAt = Infinity;

  readonly current = computed<Move | null>(() => this.list()[this.pos()] ?? null);

  /** The layer to draw highlighted: the one turning now, or the one about to turn. */
  readonly active = computed<ActiveTurn | null>(() => {
    const t = this.turn();
    if (t) return t;
    const m = this.current();
    const live = this.playing() || this.phase() !== 'idle' || this.pos() > 0;
    return m && live ? { spec: moveSpec(m), angle: 0 } : null;
  });

  readonly tip = computed(() => {
    const c = this.chunks().find((x) => this.inChunk(x));
    return c?.name && c.tip ? { name: c.name, tip: c.tip } : null;
  });

  readonly doneText = computed(() =>
    this.learn()
      ? 'The cube is solved. Replay it, or hide the moves and try to recall them.'
      : 'All moves played.',
  );

  constructor() {
    effect(() => {
      this.moves();
      this.start();
      untracked(() => this.rebuild(0));
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onHidden);
    }
  }

  ngOnDestroy() {
    this.halt();
    document.removeEventListener('visibilitychange', this.onHidden);
  }

  private readonly onHidden = () => {
    if (document.visibilityState === 'hidden') this.pause();
  };

  label = (m: Move | undefined) => (m ? formatMove(m) : '');
  describe = (m: Move) => describeMove(m);
  range = (c: Chunk) => Array.from({ length: c.to - c.from }, (_, k) => c.from + k);
  inChunk = (c: Chunk) => this.pos() >= c.from && this.pos() < c.to;

  // ------------------------------------------------------------------ state

  private snapshot() {
    this.stickers.set(
      this.cube.stickers.map((s) => ({ p: [...s.p], n: [...s.n], c: s.c }) as Sticker),
    );
  }

  /** Put the cube in the position before move `i`, with no animation. */
  private rebuild(i: number) {
    this.halt();
    let base: Cube;
    try {
      base = stateAfter(this.start());
    } catch {
      base = new Cube();
    }
    this.cube = base;
    const ms = this.list();
    for (let k = 0; k < Math.min(i, ms.length); k++) this.cube.applyMove(ms[k]);
    this.pos.set(Math.min(i, ms.length));
    this.snapshot();
  }

  private halt() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    this.playing.set(false);
    this.phase.set('idle');
    this.turn.set(null);
    this.stopAt = Infinity;
  }

  // -------------------------------------------------------------- controls

  restart() {
    this.rebuild(0);
  }

  jump(i: number) {
    this.rebuild(i);
  }

  toggle() {
    if (this.playing()) {
      this.pause();
      return;
    }
    if (this.pos() >= this.total()) this.rebuild(0);
    this.play(Infinity);
  }

  cycleSpeed() {
    this.speed.update((s) => (s === 0.5 ? 1 : s === 1 ? 2 : 0.5));
  }

  pause() {
    this.playing.set(false);
    clearTimeout(this.timer);
    if (this.phase() === 'highlight') this.phase.set('idle');
  }

  stepForward() {
    if (this.busy() || this.pos() >= this.total()) return;
    this.playing.set(false);
    this.run(this.list()[this.pos()], 1, () => undefined);
  }

  stepBack() {
    if (this.busy() || this.pos() === 0) return;
    this.playing.set(false);
    const m = this.list()[this.pos() - 1];
    const inv: Move = {
      base: m.base,
      turns: (m.turns === 2 ? 2 : m.turns === 1 ? 3 : 1) as 1 | 2 | 3,
    };
    this.run(inv, -1, () => undefined);
  }

  /** Play just one named chunk, from its first move, then stop. */
  playChunk(c: Chunk) {
    this.rebuild(c.from);
    this.play(c.to);
  }

  // ------------------------------------------------------------- animation

  private play(stopAt: number) {
    this.stopAt = stopAt;
    this.playing.set(true);
    this.next();
  }

  /** one second per move: highlight the layer, turn it, rest, then the next. */
  private next() {
    if (!this.playing()) return;
    if (this.pos() >= Math.min(this.total(), this.stopAt)) {
      this.playing.set(false);
      this.stopAt = Infinity;
      return;
    }
    const k = this.speed();
    this.phase.set('highlight');
    this.timer = setTimeout(() => {
      if (!this.playing()) return;
      this.run(this.list()[this.pos()], 1, () => {
        this.timer = setTimeout(() => this.next(), REST_MS / k);
      });
    }, HIGHLIGHT_MS / k);
  }

  private run(move: Move, dir: 1 | -1, done: () => void) {
    const spec = moveSpec(move);
    const ms = TURN_MS / this.speed();
    const t0 = performance.now();
    this.phase.set('turn');
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      this.turn.set({ spec, angle: 90 * spec.quarter * ease(k) });
      if (k < 1) {
        this.raf = requestAnimationFrame(tick);
        return;
      }
      this.cube.applyMove(move);
      this.snapshot();
      this.pos.update((p) => p + dir);
      this.turn.set(null);
      this.phase.set('idle');
      done();
    };
    this.raf = requestAnimationFrame(tick);
  }
}
