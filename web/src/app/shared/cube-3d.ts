import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FACES, FACE_COLORS, Face, MoveSpec, Sticker, Vec } from '@domain/cube';

/** The turn being shown: which layer, and how far round it is (degrees, right-handed about the axis). */
export interface ActiveTurn {
  spec: MoveSpec;
  angle: number;
}

/** Grey, darkened version of a colour: used for everything that is NOT part of the current move. */
function dimmed(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const y = Math.round((0.3 * r + 0.59 * g + 0.11 * b) * 0.42 + 14);
  return `rgb(${y},${y},${y + 4})`;
}

/** CSS transform that turns a plane (normal +z) so it faces `n` (x right, y up, z to the viewer). */
function faceRotation(n: Vec): string {
  if (n[2] === 1) return '';
  if (n[2] === -1) return 'rotateY(180deg)';
  if (n[0] === 1) return 'rotateY(90deg)';
  if (n[0] === -1) return 'rotateY(-90deg)';
  return n[1] === 1 ? 'rotateX(90deg)' : 'rotateX(-90deg)';
}

/** CSS for "turn by `deg` right-handed about the math axis" (CSS flips y, so x and z change sign). */
function axisRotation(axis: 0 | 1 | 2, deg: number): string {
  return axis === 0
    ? `rotateX(${-deg}deg)`
    : axis === 1
      ? `rotateY(${deg}deg)`
      : `rotateZ(${-deg}deg)`;
}

const U = 'var(--s)';
const at = (v: Vec) =>
  `translate3d(calc(${U} * ${v[0]}), calc(${U} * ${-v[1]}), calc(${U} * ${v[2]}))`;

const CUBIES: Vec[] = [];
for (let x = -1; x <= 1; x++)
  for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) CUBIES.push([x, y, z]);
const NORMALS: Vec[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * A 3D cube you can spin with a mouse or a finger. Purely presentational: it draws the stickers it is
 * given, and (optionally) one layer part-way through a turn, with everything else greyed out.
 */
@Component({
  selector: 'app-cube-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="stage"
      tabindex="0"
      role="img"
      aria-label="3D cube. Drag to rotate, double-tap to reset the view."
      (pointerdown)="down($event)"
      (pointermove)="move($event)"
      (pointerup)="up($event)"
      (pointercancel)="up($event)"
      (dblclick)="reset()"
      (keydown)="key($event)"
    >
      <div class="cube" [style.transform]="view()">
        @for (b of bodies(); track $index) {
          <i class="body" [style.transform]="b"></i>
        }
        @for (s of stickers3d(); track $index) {
          <i class="st" [style.transform]="s.t" [style.background]="s.c"></i>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      container-type: inline-size;
    }
    .stage {
      --cube: clamp(150px, 54cqw, 230px);
      --s: calc(var(--cube) / 3);
      width: min(100%, calc(var(--cube) * 1.5));
      height: calc(var(--cube) * 1.6);
      margin: 0 auto;
      display: grid;
      place-items: center;
      perspective: calc(var(--cube) * 5);
      cursor: grab;
      touch-action: none; /* a finger on the cube spins it; the space around it still scrolls the page */
      user-select: none;
      -webkit-user-select: none;
      outline-offset: 2px;
    }
    .stage:active {
      cursor: grabbing;
    }
    .cube {
      position: relative;
      width: var(--cube);
      height: var(--cube);
      transform-style: preserve-3d;
    }
    .cube i {
      position: absolute;
      left: calc(50% - var(--s) / 2);
      top: calc(50% - var(--s) / 2);
      width: var(--s);
      height: var(--s);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
    .body {
      background: #090b10;
    }
    .st {
      --g: calc(var(--s) * 0.07);
      left: calc(50% - var(--s) / 2 + var(--g)) !important;
      top: calc(50% - var(--s) / 2 + var(--g)) !important;
      width: calc(var(--s) - var(--g) * 2) !important;
      height: calc(var(--s) - var(--g) * 2) !important;
      border-radius: calc(var(--s) * 0.14);
      transition: background-color 0.22s ease;
    }
  `,
})
export class Cube3d {
  /** every sticker of the cube in its current place */
  readonly stickers = input.required<Sticker[]>();
  /** colour of each face of the solved cube (depends on how it is held); default = standard scheme */
  readonly scheme = input<Record<Face, string> | null>(null);
  /** the layer that is turning (or about to), or null for a plain still picture */
  readonly active = input<ActiveTurn | null>(null);
  /** grey out everything except the active layer */
  readonly focus = input(true);

  readonly rx = signal(START_X);
  readonly ry = signal(START_Y);
  readonly view = computed(() => `rotateX(${this.rx()}deg) rotateY(${this.ry()}deg)`);

  private readonly layerTurn = computed(() => {
    const a = this.active();
    return a && a.angle !== 0 ? axisRotation(a.spec.axis, a.angle) + ' ' : '';
  });

  /** the black plastic: six faces per cubie so nothing is see-through while a layer turns */
  readonly bodies = computed(() => {
    const a = this.active();
    const turn = this.layerTurn();
    const out: string[] = [];
    for (const p of CUBIES) {
      const moving = !!a && turn !== '' && a.spec.inLayer(p);
      for (const n of NORMALS) {
        const t = `${at(p)} ${faceRotation(n)} translateZ(calc(${U} * 0.5 - 0.6px))`;
        out.push(moving ? turn + t : t);
      }
    }
    return out;
  });

  readonly stickers3d = computed(() => {
    const a = this.active();
    const turn = this.layerTurn();
    const dim = this.focus() && !!a && !a.spec.whole;
    const scheme = this.scheme() ?? FACE_COLORS;
    return this.stickers().map((s) => {
      const inLayer = !!a && a.spec.inLayer(s.p);
      const base = scheme[FACES[s.c]];
      const t = `${at(s.p)} ${faceRotation(s.n)} translateZ(calc(${U} * 0.5))`;
      return {
        t: inLayer && turn !== '' ? turn + t : t,
        c: dim && !inLayer ? dimmed(base) : base,
      };
    });
  });

  private drag: { id: number; x: number; y: number } | null = null;

  down(e: PointerEvent) {
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  move(e: PointerEvent) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.ry.update((v) => v + (e.clientX - d.x) * 0.6);
    this.rx.update((v) => Math.max(-90, Math.min(90, v - (e.clientY - d.y) * 0.6)));
    d.x = e.clientX;
    d.y = e.clientY;
  }

  up(e: PointerEvent) {
    if (this.drag?.id === e.pointerId) this.drag = null;
  }

  key(e: KeyboardEvent) {
    const step = 15;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => this.ry.update((v) => v - step),
      ArrowRight: () => this.ry.update((v) => v + step),
      ArrowUp: () => this.rx.update((v) => Math.min(90, v + step)),
      ArrowDown: () => this.rx.update((v) => Math.max(-90, v - step)),
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    m();
  }

  reset() {
    this.rx.set(START_X);
    this.ry.set(START_Y);
  }
}

const START_X = -28;
const START_Y = -38;
