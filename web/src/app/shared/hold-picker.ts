import { Component, computed, input, model, ChangeDetectionStrategy } from '@angular/core';
import {
  COLOR_HEX,
  ColorName,
  Hold,
  COLOR_NAMES,
  holdText,
  normalizeHold,
  schemeNames,
  validFronts,
} from '@domain/orientation';

/** "Hold the solved cube like this before scrambling": top / front colour selectors plus a mini picture. */
@Component({
  selector: 'app-hold-picker',
  standalone: true,
  template: `
    <details class="hold">
      <summary>
        <span class="label">{{ title() }}</span>
        <span class="chips">
          <span class="chip"
            ><i class="dot" [style.background]="hex(names().U)"></i><small>Top</small
            ><b>{{ names().U }}</b></span
          >
          <span class="chip"
            ><i class="dot" [style.background]="hex(names().F)"></i><small>Front</small
            ><b>{{ names().F }}</b></span
          >
          <span class="chip"
            ><i class="dot" [style.background]="hex(names().R)"></i><small>Right</small
            ><b>{{ names().R }}</b></span
          >
        </span>
        <span class="change">Change</span>
      </summary>
      <div class="muted small">{{ sentence() }}</div>
      <div class="controls">
        <label class="field"
          >{{ topLabel() }}
          <select (change)="setTop($any($event.target).value)">
            @for (c of colors; track c) {
              <option [value]="c" [selected]="c === value().top">{{ c }}</option>
            }
          </select>
        </label>
        <label class="field"
          >Front
          <select (change)="setFront($any($event.target).value)">
            @for (c of fronts(); track c) {
              <option [value]="c" [selected]="c === value().front">{{ c }}</option>
            }
          </select>
        </label>
        @if (presets().length) {
          <div class="presets">
            @for (p of presets(); track p.label) {
              <button class="btn small" (click)="value.set(p.hold)">{{ p.label }}</button>
            }
          </div>
        }
      </div>
    </details>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .hold {
      background: var(--bg);
      border: 1px solid var(--line-soft);
      border-radius: 14px;
      padding: 12px 14px;
      display: grid;
      gap: 12px;
    }
    summary {
      list-style: none;
      cursor: pointer;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px 12px;
      align-items: center;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    .label {
      grid-column: 1 / -1;
    }
    .chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px 5px 8px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 999px;
      font-size: 13.5px;
      white-space: nowrap;
    }
    .chip small {
      color: var(--muted);
      font-size: 12px;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 4px;
      border: 1px solid #0006;
    }
    .change {
      color: var(--accent);
      font-size: 13.5px;
      font-weight: 600;
    }
    details[open] .change::after {
      content: ' ▴';
    }
    details:not([open]) .change::after {
      content: ' ▾';
    }
    .controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .controls select {
      width: 100%;
    }
    .presets {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .small {
      font-size: 12.5px;
    }
  `,
})
export class HoldPicker {
  readonly value = model.required<Hold>();
  readonly title = input('Before you scramble');
  readonly topLabel = input('Top');
  readonly presets = input<{ label: string; hold: Hold }[]>([]);
  readonly colors = COLOR_NAMES;

  readonly names = computed(() => schemeNames(this.value()));
  readonly fronts = computed(() => validFronts(this.value().top));
  readonly sentence = computed(() => holdText(this.value()));
  readonly hex = (c: ColorName) => COLOR_HEX[c];

  setTop(top: ColorName) {
    this.value.set(normalizeHold({ top, front: this.value().front }));
  }
  setFront(front: ColorName) {
    this.value.set({ top: this.value().top, front });
  }
}
