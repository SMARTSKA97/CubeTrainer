import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** An on/off switch with its label. */
@Component({
  selector: 'app-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    button {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      min-height: 52px;
      padding: 8px 0;
      border: 0;
      background: none;
      color: var(--text);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .txt {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: 2px;
    }
    .hint {
      font-size: 13px;
      color: var(--muted);
    }
    .track {
      position: relative;
      flex: 0 0 auto;
      width: 46px;
      height: 28px;
      border-radius: 999px;
      background: var(--panel-2);
      border: 1px solid var(--line);
      transition: background 0.2s;
    }
    .knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--muted);
      transition:
        transform 0.2s cubic-bezier(0.3, 0.9, 0.3, 1),
        background 0.2s;
    }
    .on .track {
      background: var(--accent-soft);
      border-color: var(--accent);
    }
    .on .knob {
      transform: translateX(18px);
      background: var(--accent);
    }
  `,
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="value()"
      [class.on]="value()"
      (click)="value.set(!value())"
    >
      <span class="txt">
        <span>{{ label() }}</span>
        @if (hint()) {
          <span class="hint">{{ hint() }}</span>
        }
      </span>
      <span class="track" aria-hidden="true"><span class="knob"></span></span>
    </button>
  `,
})
export class Switch {
  readonly label = input.required<string>();
  readonly hint = input('');
  readonly value = model(false);
}
