import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { usePref } from '@core/pref';
import { Cube3d } from './cube-3d';
import { FACES, FACE_COLORS, Face, stateAfter } from '@domain/cube';

/**
 * The cube after a scramble: a flat unfolded net (inline SVG) or a 3D cube you can spin with a mouse
 * or a finger. The chosen view is remembered.
 */
@Component({
  selector: 'app-scramble-net',
  standalone: true,
  imports: [Cube3d],
  template: `
    @if (view() === 'net') {
      <div class="seg" role="group" aria-label="Cube view">
        <button type="button" [class.on]="!threeD()" (click)="threeD.set(false)">Unfolded</button>
        <button type="button" [class.on]="threeD()" (click)="threeD.set(true)">3D</button>
      </div>
    }
    @if (view() === 'net' && threeD()) {
      <app-cube-3d [stickers]="stickers()" [scheme]="scheme()" />
      <div class="hint muted">Drag to rotate · double-tap to reset</div>
    } @else if (view() === 'top') {
      <svg
        [attr.viewBox]="'0 0 ' + TW + ' ' + TW"
        class="net top"
        role="img"
        aria-label="Top of the cube"
      >
        @for (c of topCells(); track $index) {
          <rect
            [attr.x]="c.x"
            [attr.y]="c.y"
            [attr.width]="c.w"
            [attr.height]="c.h"
            rx="3"
            [attr.fill]="c.color"
          />
        }
      </svg>
    } @else {
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="net" role="img" aria-label="Scrambled cube">
        @for (f of faces(); track f.face) {
          @for (c of f.cells; track $index) {
            <rect
              [attr.x]="f.x + c.x"
              [attr.y]="f.y + c.y"
              [attr.width]="S - 2"
              [attr.height]="S - 2"
              rx="3"
              [attr.fill]="c.color"
            />
          }
        }
      </svg>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: 12px;
      width: 100%;
      min-width: 0;
    }
    .seg {
      display: inline-flex;
      padding: 3px;
      gap: 2px;
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 999px;
    }
    .seg button {
      border: 0;
      background: none;
      color: var(--muted);
      font: inherit;
      font-size: 13px;
      font-weight: 550;
      padding: 5px 14px;
      border-radius: 999px;
      cursor: pointer;
    }
    .seg button.on {
      background: var(--accent-soft);
      color: var(--text);
    }
    .hint {
      font-size: 12.5px;
      text-align: center;
    }
    .net {
      width: 100%;
      max-width: 360px;
      height: auto;
      margin-inline: auto;
    }
    .net.top {
      max-width: 170px;
    }
    rect {
      stroke: #0b0d12;
      stroke-width: 1.5;
    }
  `,
})
export class ScrambleNet {
  readonly scramble = input.required<string>();
  /** colour of each face of the SOLVED cube (depends on how it is held); default = standard scheme */
  readonly scheme = input<Record<Face, string> | null>(null);
  /** 'net' = all six faces; 'top' = last-layer view (top face plus the top row of the four sides) */
  readonly view = input<'net' | 'top'>('net');
  /** OLL style picture: stickers of the top colour stay coloured, every other sticker is grey */
  readonly mask = input(false);

  /** true = 3D cube, false = unfolded net; shared by every picture in the app */
  readonly threeD = usePref('cube.view3d', false);
  readonly stickers = computed(() => {
    try {
      return stateAfter(this.scramble()).stickers;
    } catch {
      return [];
    }
  });

  readonly TS = 30;
  readonly TT = 11;
  readonly TG = 4;
  readonly TW = this.TS * 3 + (this.TT + this.TG) * 2;

  readonly topCells = computed(() => {
    let cube;
    try {
      cube = stateAfter(this.scramble());
    } catch {
      return [];
    }
    const col = (i: number) =>
      this.mask() && i !== 0 ? '#6b7280' : (this.scheme() ?? FACE_COLORS)[FACES[i]];
    const { TS: S, TT: T, TG: G } = this;
    const o = T + G;
    const U = cube.faceGrid('U');
    const B = cube.faceGrid('B');
    const F = cube.faceGrid('F');
    const L = cube.faceGrid('L');
    const R = cube.faceGrid('R');
    const cells: { x: number; y: number; w: number; h: number; color: string }[] = [];
    for (let i = 0; i < 9; i++)
      cells.push({
        x: o + (i % 3) * S,
        y: o + Math.floor(i / 3) * S,
        w: S - 2,
        h: S - 2,
        color: col(U[i]),
      });
    for (let c = 0; c < 3; c++) {
      cells.push({ x: o + c * S, y: 0, w: S - 2, h: T, color: col(B[2 - c]) }); // back, seen from above (mirrored)
      cells.push({ x: o + c * S, y: o + 3 * S + G - 2, w: S - 2, h: T, color: col(F[c]) });
    }
    for (let r = 0; r < 3; r++) {
      cells.push({ x: 0, y: o + r * S, w: T, h: S - 2, color: col(L[r]) });
      cells.push({ x: o + 3 * S + G - 2, y: o + r * S, w: T, h: S - 2, color: col(R[2 - r]) });
    }
    return cells;
  });

  readonly S = 22;
  readonly G = 4;
  readonly W = this.S * 12 + this.G * 3;
  readonly H = this.S * 9 + this.G * 2;

  private readonly layout: Record<Face, [number, number]> = {
    U: [3, 0],
    L: [0, 3],
    F: [3, 3],
    R: [6, 3],
    B: [9, 3],
    D: [3, 6],
  };

  readonly faces = computed(() => {
    let cube;
    try {
      cube = stateAfter(this.scramble());
    } catch {
      return [];
    }
    return FACES.map((face) => {
      const [cx, cy] = this.layout[face];
      const x = cx * this.S + (cx / 3) * this.G;
      const y = cy * this.S + (cy / 3) * this.G;
      const grid = cube.faceGrid(face);
      return {
        face,
        x,
        y,
        cells: grid.map((c, i) => ({
          x: (i % 3) * this.S,
          y: Math.floor(i / 3) * this.S,
          color: (this.scheme() ?? FACE_COLORS)[FACES[c]],
        })),
      };
    });
  });
}
