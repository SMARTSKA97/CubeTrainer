import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { AlgCase } from '@core/data/alg-service';
import { FACES, FACE_COLORS, Face, caseScramble, stateAfter } from '@domain/cube';
import { ScrambleNet } from './scramble-net';

const C = 8.66; // cos 30 * 10
const S = 5; // sin 30 * 10

type P = [number, number];

/**
 * The picture of an algorithm case. Uses the bundled image when there is one; otherwise draws the
 * case itself from the cube engine: the top layer seen from above for OLL+PLL, or the corner
 * where the pair sits (top, front and right faces) for F2L and beginner cases.
 */
@Component({
  selector: 'app-case-pic',
  standalone: true,
  imports: [ScrambleNet],
  template: `
    @if (url(); as u) {
      <img [src]="u" [alt]="c().name" />
    } @else if (topView()) {
      <div class="top"><app-scramble-net [scramble]="scramble()" view="top" /></div>
    } @else {
      <svg viewBox="-27 -31 54 62" role="img" [attr.aria-label]="c().name">
        @for (p of polys(); track $index) {
          <polygon [attr.points]="p.pts" [attr.fill]="p.color" />
        }
      </svg>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      width: var(--pic, 72px);
      height: var(--pic, 72px);
      flex: none;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
    }
    img,
    svg {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .top {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      padding: 8%;
      box-sizing: border-box;
      background: #1b1f2a;
    }
    polygon {
      stroke: #0b0d12;
      stroke-width: 0.9;
      stroke-linejoin: round;
    }
  `,
})
export class CasePic {
  readonly c = input.required<AlgCase>();

  readonly url = computed(() => (this.c().img ? `algs/${this.c().img}` : null));
  readonly topView = computed(() => this.c().set === 'ollpll');
  readonly scramble = computed(() => this.c().setup ?? caseScramble(this.c().alg).scramble);

  readonly polys = computed(() => {
    let cube;
    try {
      cube = stateAfter(this.scramble());
    } catch {
      return [];
    }
    // corner nearest the viewer is (0,0); F runs up-left, R runs up-right, U lies on top
    const pt = (face: Face, r: number, c: number): P => {
      if (face === 'F') return [(c - 3) * C, (c - 3) * S + r * 10];
      if (face === 'R') return [c * C, -c * S + r * 10];
      return [(c - 3) * C + (3 - r) * C, (c - 3) * S - (3 - r) * S];
    };
    const out: { pts: string; color: string }[] = [];
    for (const face of ['U', 'F', 'R'] as Face[]) {
      const grid = cube.faceGrid(face);
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
          const pts = [
            pt(face, r, c),
            pt(face, r, c + 1),
            pt(face, r + 1, c + 1),
            pt(face, r + 1, c),
          ]
            .map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`)
            .join(' ');
          out.push({ pts, color: FACE_COLORS[FACES[grid[r * 3 + c]]] });
        }
    }
    return out;
  });
}
