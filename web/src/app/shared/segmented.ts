import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface SegOption<T extends string> {
  value: T;
  label: string;
}

/** A pill of mutually exclusive choices with a sliding highlight. */
@Component({
  selector: 'app-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      max-width: 100%;
    }
    .wrap {
      position: relative;
      display: inline-grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      max-width: 100%;
      padding: 3px;
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 999px;
    }
    .thumb {
      position: absolute;
      top: 3px;
      bottom: 3px;
      left: 3px;
      border-radius: 999px;
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1px var(--accent);
      transition: transform 0.22s cubic-bezier(0.3, 0.9, 0.3, 1);
      pointer-events: none;
    }
    button {
      position: relative;
      min-height: 36px;
      padding: 6px 14px;
      border: 0;
      border-radius: 999px;
      background: none;
      color: var(--muted);
      font: inherit;
      font-size: 14px;
      cursor: pointer;
      white-space: nowrap;
    }
    button.on {
      color: var(--text);
    }
  `,
  template: `
    <div class="wrap" role="radiogroup" [attr.aria-label]="label()">
      <span
        class="thumb"
        aria-hidden="true"
        [style.width]="'calc((100% - 6px) / ' + options().length + ')'"
        [style.transform]="'translateX(' + index() * 100 + '%)'"
      ></span>
      @for (o of options(); track o.value) {
        <button
          type="button"
          role="radio"
          [class.on]="o.value === value()"
          [attr.aria-checked]="o.value === value()"
          (click)="value.set(o.value)"
        >
          {{ o.label }}
        </button>
      }
    </div>
  `,
})
export class Segmented<T extends string> {
  readonly options = input.required<SegOption<T>[]>();
  readonly label = input('');
  readonly value = model.required<T>();
  index = () =>
    Math.max(
      0,
      this.options().findIndex((o) => o.value === this.value()),
    );
}
