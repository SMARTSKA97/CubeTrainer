import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith, switchMap } from 'rxjs';
import { STRENGTH_LABEL, passwordStrength } from '@core/auth/auth-utils';

/** Password input with a show/hide toggle and (optionally) a length-first strength meter. */
@Component({
  selector: 'app-password-field',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="field">
      {{ label() }}
      <span class="wrap">
        <input
          [type]="visible() ? 'text' : 'password'"
          [formControl]="control()"
          [attr.autocomplete]="autocomplete()"
          [attr.aria-invalid]="control().invalid && control().touched"
          [attr.maxlength]="maxLength()"
        />
        <button
          type="button"
          class="toggle"
          (click)="visible.set(!visible())"
          [attr.aria-label]="visible() ? 'Hide password' : 'Show password'"
        >
          {{ visible() ? 'Hide' : 'Show' }}
        </button>
      </span>
    </label>
    @if (showStrength() && typed()) {
      <div class="meter" role="status">
        <span class="bar"
          ><i [style.width.%]="strength() * 25" [attr.data-s]="strength()"></i
        ></span>
        <span class="muted">{{ label2() }}</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .wrap {
      position: relative;
      display: block;
    }
    input {
      width: 100%;
      padding-right: 64px;
    }
    .toggle {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: 0;
      color: var(--accent);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
      padding: 4px 8px;
    }
    .meter {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      font-size: 12px;
    }
    .bar {
      flex: 1;
      height: 5px;
      border-radius: 99px;
      background: var(--line);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      transition: width 0.2s;
      background: #ef4444;
    }
    .bar i[data-s='2'] {
      background: #f59e0b;
    }
    .bar i[data-s='3'] {
      background: #84cc16;
    }
    .bar i[data-s='4'] {
      background: #22c55e;
    }
  `,
})
export class PasswordField {
  readonly control = input.required<FormControl<string>>();
  readonly label = input('Password');
  readonly autocomplete = input<'current-password' | 'new-password'>('current-password');
  readonly showStrength = input(false);
  readonly minLength = input(10);
  readonly maxLength = input<number | null>(128);

  protected readonly visible = signal(false);
  // Form control values are not signals, so bridge them for the (OnPush) strength meter.
  private readonly typed = toSignal(
    toObservable(this.control).pipe(switchMap((c) => c.valueChanges.pipe(startWith(c.value)))),
    { initialValue: '' },
  );
  protected readonly strength = computed(() => passwordStrength(this.typed(), this.minLength()));
  protected readonly label2 = computed(() => STRENGTH_LABEL[this.strength()]);
}
