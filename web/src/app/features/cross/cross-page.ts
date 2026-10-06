import { Component, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { FACES, Face, randomScramble } from '@domain/cube';
import { crossLengths, solveCross } from '@domain/cross-solver';
import { usePref } from '@core/pref';
import { COLOR_HEX, Hold, STANDARD_HOLD, schemeNames } from '@domain/orientation';
import { ScrambleNet } from '@shared/scramble-net';
import { HoldPicker } from '@shared/hold-picker';
import { schemeHex } from '@domain/orientation';

@Component({
  selector: 'app-cross-page',
  standalone: true,
  imports: [ScrambleNet, HoldPicker],
  template: `
    <section class="card">
      <div class="label">Cross solver (analysis)</div>
      <p class="muted">
        Finds the shortest possible cross for a scramble. Use it after a solve to see how good your
        inspection was: was there a shorter cross, or a better colour to start with?
      </p>
      <app-hold-picker
        [value]="hold()"
        (valueChange)="hold.set($event)"
        title="Cube as you held it when scrambling"
      />
      <label class="field"
        >Scramble
        <input
          type="text"
          [value]="scramble()"
          (input)="scramble.set($any($event.target).value)"
          placeholder="paste a scramble, e.g. R U R' F2 …"
        />
      </label>
      <div class="row" style="margin-top:10px">
        <button class="btn" (click)="scramble.set(random())">Random scramble</button>
        <button class="btn" (click)="useLast()">Use the Timer's scramble</button>
        <label class="field"
          >Solve cross on
          <select (change)="colour.set($any($event.target).value)">
            @for (c of colours(); track c.face) {
              <option [value]="c.face" [selected]="c.face === colour()">
                {{ c.name }} ({{ c.face }} face)
              </option>
            }
          </select>
        </label>
        <button class="btn primary" (click)="solve()">Solve cross</button>
        <button class="btn" (click)="compare()">Compare all 6 colours</button>
      </div>
      @if (error()) {
        <div class="err">{{ error() }}</div>
      }
    </section>

    @if (result(); as r) {
      <section class="card">
        <div class="label">{{ r.length }}-move cross on {{ r.name }}</div>
        <div class="alg">{{ r.moves.length ? r.moves.join(' ') : 'Already solved.' }}</div>
        <div class="muted small">
          Hold the cube as set above (top {{ names().U }}, front {{ names().F }}) and apply the
          scramble first. The moves are in the same frame.
        </div>
        <app-scramble-net [scramble]="scramble()" [scheme]="scheme()" />
      </section>
    }

    @if (all(); as a) {
      <section class="card">
        <div class="label">Optimal cross length per colour</div>
        <div class="row cmp">
          @for (c of a; track c.face) {
            <div class="chipc" [class.best]="c.length === min()">
              <span class="dot" [style.background]="c.hex"></span>{{ c.name }}
              <b>{{ c.length ?? '?' }}</b>
            </div>
          }
        </div>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    p {
      margin: 6px 0 12px;
    }
    input[type='text'] {
      width: 100%;
      font-family: ui-monospace, Menlo, Consolas, monospace;
    }
    .alg {
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 26px;
      margin: 8px 0;
      word-spacing: 8px;
    }
    .small {
      font-size: 13px;
      margin-bottom: 10px;
    }
    .err {
      color: #ef4444;
      margin-top: 8px;
    }
    .cmp {
      gap: 10px;
      margin-top: 8px;
    }
    .chipc {
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 12px;
    }
    .chipc.best {
      border-color: #22c55e;
    }
    .dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 3px;
      margin-right: 6px;
    }
  `,
})
export class CrossPage {
  readonly hold = usePref<Hold>('cross.hold', STANDARD_HOLD);
  readonly scramble = signal(this.lastScramble());
  readonly colour = signal<Face>('D');
  readonly error = signal('');
  readonly result = signal<{ moves: string[]; length: number; name: string } | null>(null);
  readonly all = signal<{ face: Face; name: string; hex: string; length: number | null }[] | null>(
    null,
  );

  readonly names = computed(() => schemeNames(this.hold()));
  readonly scheme = computed(() => schemeHex(this.hold()));
  readonly colours = computed(() => FACES.map((f) => ({ face: f, name: this.names()[f] })));
  readonly min = computed(() => Math.min(...(this.all() ?? []).map((c) => c.length ?? 99)));

  random = () => randomScramble(20);

  private lastScramble(): string {
    try {
      return localStorage.getItem('cubetrainer.lastScramble') ?? randomScramble(20);
    } catch {
      return randomScramble(20);
    }
  }

  useLast() {
    this.scramble.set(this.lastScramble());
  }

  solve() {
    this.error.set('');
    this.all.set(null);
    try {
      const face = this.colour();
      const s = solveCross(this.scramble(), face);
      if (!s) throw new Error('No cross found within 9 moves.');
      this.result.set({ ...s, name: this.names()[face] });
    } catch (e) {
      this.result.set(null);
      this.error.set('Could not read that scramble: ' + (e as Error).message);
    }
  }

  compare() {
    this.error.set('');
    try {
      const l = crossLengths(this.scramble());
      this.all.set(
        FACES.map((f) => ({
          face: f,
          name: this.names()[f],
          hex: COLOR_HEX[this.names()[f]],
          length: l[f],
        })),
      );
    } catch (e) {
      this.error.set('Could not read that scramble: ' + (e as Error).message);
    }
  }
}
