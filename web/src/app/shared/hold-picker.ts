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
    <div class="hold">
      <div class="text">
        <span class="label">{{ title() }}</span>
        <div class="sentence">
          Top
          <span class="dot" [style.background]="hex(names().U)"></span><b>{{ names().U }}</b>
          · Front
          <span class="dot" [style.background]="hex(names().F)"></span><b>{{ names().F }}</b>
          <span class="muted">· right {{ names().R }}</span>
        </div>
        <div class="muted small">{{ sentence() }}</div>
      </div>
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
        @for (p of presets(); track p.label) {
          <button class="btn small" (click)="value.set(p.hold)">{{ p.label }}</button>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .hold {
      display: flex;
      gap: 16px;
      justify-content: space-between;
      flex-wrap: wrap;
      align-items: flex-end;
      margin: 4px 0 10px;
      padding: 10px 12px;
      border: 1px dashed var(--line);
      border-radius: 12px;
    }
    .sentence {
      font-size: 18px;
      margin: 2px 0;
    }
    .dot {
      display: inline-block;
      width: 14px;
      height: 14px;
      border-radius: 4px;
      margin: 0 4px 0 6px;
      vertical-align: -2px;
      border: 1px solid #0006;
    }
    .controls {
      display: flex;
      gap: 10px;
      align-items: flex-end;
      flex-wrap: wrap;
    }
    .small {
      font-size: 12px;
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
