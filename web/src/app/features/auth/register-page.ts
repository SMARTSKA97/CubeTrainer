import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  AsyncValidatorFn,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, firstValueFrom, map, of, switchMap, timer } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';
import { CUBE_METHODS, RegisterPayload } from '@core/auth/auth.models';
import { regionFromLocale, toProblem } from '@core/auth/auth-utils';
import { countryOptions } from '@core/auth/countries';
import { PasswordField } from '@shared/password-field';
import { AuthCard } from './auth-card';

const HANDLE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, AuthCard, PasswordField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-form.css',
  template: `
    @if (sentTo(); as address) {
      <app-auth-card
        title="Check your email"
        [subtitle]="'We sent a confirmation link to ' + address + '. It works for 24 hours.'"
      >
        <p class="banner">
          Open the link, then sign in. If nothing arrives within a few minutes, look in your spam
          folder or send it again.
        </p>
        <p class="row">
          <button
            class="btn"
            type="button"
            (click)="resend()"
            [disabled]="cooldown() > 0 || busy()"
          >
            {{ cooldown() > 0 ? 'Send again in ' + cooldown() + 's' : 'Send the link again' }}
          </button>
          <a class="btn primary" routerLink="/auth/login">Go to sign in</a>
        </p>
        @if (resent()) {
          <p class="ok">Sent again.</p>
        }
      </app-auth-card>
    } @else {
      <app-auth-card
        title="Create your account"
        subtitle="Free. Your history is backed up, and later you can sync devices and join leaderboards."
      >
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error(); as e) {
            <p class="banner error" role="alert">{{ e }}</p>
            @for (d of details(); track d) {
              <p class="err">{{ d }}</p>
            }
          }

          <fieldset>
            <legend>Account</legend>
            <label class="field">
              Email
              <input type="email" formControlName="email" autocomplete="email" inputmode="email" />
              @if (touched('email') && form.controls.email.invalid) {
                <span class="err">Enter a valid email address.</span>
              }
            </label>
            <app-password-field
              [control]="form.controls.password"
              label="Password"
              autocomplete="new-password"
              [showStrength]="true"
              [minLength]="minPassword()"
            />
            @if (touched('password') && form.controls.password.invalid) {
              <span class="err">Use at least {{ minPassword() }} characters.</span>
            } @else {
              <span class="hint"
                >At least {{ minPassword() }} characters. A few random words make a strong,
                memorable password.</span
              >
            }
          </fieldset>

          <fieldset>
            <legend>Public profile</legend>
            <div class="grid2">
              <label class="field">
                Display name
                <input
                  type="text"
                  formControlName="displayName"
                  autocomplete="nickname"
                  maxlength="40"
                />
              </label>
              <label class="field">
                Username
                <input
                  type="text"
                  formControlName="handle"
                  autocomplete="username"
                  maxlength="20"
                  autocapitalize="off"
                  spellcheck="false"
                />
              </label>
            </div>
            @if (form.controls.handle.pending) {
              <span class="hint">Checking username…</span>
            } @else if (form.controls.handle.errors?.['taken']) {
              <span class="err">That username is taken.</span>
            } @else if (touched('handle') && form.controls.handle.errors?.['pattern']) {
              <span class="err"
                >3-20 characters: letters, numbers, underscore; start with a letter.</span
              >
            } @else if (form.controls.handle.valid && form.controls.handle.value) {
              <span class="ok">Username is available.</span>
            } @else {
              <span class="hint"
                >Shown on leaderboards. You can use letters, numbers and underscore.</span
              >
            }
            <div class="grid2">
              <label class="field">
                Country
                <select formControlName="country">
                  <option value="" disabled>Choose…</option>
                  @for (c of countries; track c.code) {
                    <option [value]="c.code">{{ c.name }}</option>
                  }
                </select>
              </label>
              <label class="field">
                Birth year
                <input
                  type="number"
                  formControlName="birthYear"
                  inputmode="numeric"
                  [min]="minYear"
                  [max]="thisYear"
                  autocomplete="bday-year"
                />
              </label>
            </div>
            @if (ageProblem(); as a) {
              <span class="err">{{ a }}</span>
            } @else {
              <span class="hint"
                >Only the year is stored. It is used for the age gate and age-group leaderboard
                filters.</span
              >
            }
          </fieldset>

          <fieldset>
            <legend>Your cubing (optional)</legend>
            <div class="grid2">
              <label class="field">
                Method
                <select formControlName="cubeMethod">
                  <option value="">Prefer not to say</option>
                  @for (m of methods; track m.value) {
                    <option [value]="m.value">{{ m.label }}</option>
                  }
                </select>
              </label>
              <label class="field">
                Years cubing
                <input
                  type="number"
                  formControlName="cubingYears"
                  inputmode="numeric"
                  min="0"
                  max="80"
                />
              </label>
            </div>
            <label class="field">
              Main cube
              <input
                type="text"
                formControlName="cubeModel"
                placeholder="e.g. GAN 13, MoYu RS3M"
                maxlength="60"
              />
            </label>
            <span class="hint">Used for your own stats and optional leaderboard filters.</span>
          </fieldset>

          <label class="check">
            <input type="checkbox" formControlName="acceptTerms" />
            <span>
              I agree to the <a routerLink="/legal/terms" target="_blank">Terms</a> and
              <a routerLink="/legal/privacy" target="_blank">Privacy Policy</a>.
            </span>
          </label>
          @if (touched('acceptTerms') && form.controls.acceptTerms.invalid) {
            <span class="err">You need to accept to create an account.</span>
          }

          <button class="btn primary" type="submit" [disabled]="busy()">
            {{ busy() ? 'Creating account…' : 'Create account' }}
          </button>
          <div class="links">
            <a routerLink="/auth/login">I already have an account</a>
            <a routerLink="/today">Continue as guest</a>
          </div>
        </form>
      </app-auth-card>
    }
  `,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);

  protected readonly countries = countryOptions(navigator.language || 'en');
  protected readonly methods = CUBE_METHODS;
  protected readonly thisYear = new Date().getFullYear();
  protected readonly minYear = this.thisYear - 110;

  private readonly policy = toSignal(this.api.policy().pipe(catchError(() => of(null))), {
    initialValue: null,
  });
  protected readonly minPassword = computed(() => this.policy()?.minPasswordLength ?? 10);
  private readonly minAge = computed(() => this.policy()?.minimumAge ?? 13);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(10)]],
    displayName: ['', [Validators.required, Validators.maxLength(40)]],
    handle: [
      '',
      {
        validators: [Validators.required, Validators.pattern(HANDLE)],
        asyncValidators: [this.handleFree()],
        updateOn: 'change',
      },
    ],
    country: [regionFromLocale(navigator.language) ?? '', [Validators.required]],
    birthYear: [null as number | null, [Validators.required]],
    cubeMethod: [''],
    cubeModel: [''],
    cubingYears: [null as number | null],
    acceptTerms: [false, [Validators.requiredTrue]],
  });

  private readonly birthYearValue = toSignal(this.form.controls.birthYear.valueChanges, {
    initialValue: null as number | null,
  });
  protected readonly ageProblem = computed(() => {
    const year = this.birthYearValue();
    if (year === null || year === undefined || String(year).length < 4) return null;
    if (year < this.minYear || year > this.thisYear) return 'Enter a valid birth year.';
    return this.thisYear - year < this.minAge()
      ? `You must be at least ${this.minAge()} to create an account. You can keep using CubeTrainer as a guest.`
      : null;
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly details = signal<string[]>([]);
  protected readonly sentTo = signal<string | null>(null);
  protected readonly cooldown = signal(0);
  protected readonly resent = signal(false);
  private readonly submitted = signal(false);

  protected touched(name: keyof typeof this.form.controls): boolean {
    return this.submitted() || this.form.controls[name].touched;
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    this.details.set([]);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.ageProblem() || this.form.controls.handle.pending) {
      this.error.set('Please fix the highlighted fields.');
      return;
    }
    const v = this.form.getRawValue();
    const body: RegisterPayload = {
      email: v.email.trim(),
      password: v.password,
      displayName: v.displayName.trim(),
      handle: v.handle.trim(),
      country: v.country,
      birthYear: Number(v.birthYear),
      cubeMethod: v.cubeMethod || null,
      cubeModel: v.cubeModel.trim() || null,
      cubingYears:
        v.cubingYears === null || v.cubingYears === undefined ? null : Number(v.cubingYears),
      acceptTerms: v.acceptTerms,
    };
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.register(body));
      this.sentTo.set(body.email);
      this.startCooldown();
    } catch (err) {
      const p = toProblem(err);
      this.error.set(p.details[0] ?? p.message);
      this.details.set(p.details.slice(1));
      if (p.code === 'handle_taken') this.form.controls.handle.setErrors({ taken: true });
    } finally {
      this.busy.set(false);
    }
  }

  protected async resend(): Promise<void> {
    const address = this.sentTo();
    if (!address) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.resendVerification(address));
      this.resent.set(true);
      this.startCooldown();
    } catch {
      /* the answer is the same either way; the user can try again */
    } finally {
      this.busy.set(false);
    }
  }

  protected goToLogin(): void {
    void this.router.navigateByUrl('/auth/login');
  }

  private startCooldown(): void {
    this.cooldown.set(60);
    const t = setInterval(() => {
      this.cooldown.update((s) => s - 1);
      if (this.cooldown() <= 0) clearInterval(t);
    }, 1000);
  }

  /** Debounced "is this username free?" check against the API. */
  private handleFree(): AsyncValidatorFn {
    return (control: AbstractControl): ReturnType<AsyncValidatorFn> => {
      const value = String(control.value ?? '');
      if (!HANDLE.test(value)) return of(null);
      return timer(400).pipe(
        switchMap(() => this.api.handleAvailable(value)),
        map((r): ValidationErrors | null => (r.available ? null : { taken: true })),
        catchError(() => of(null)), // offline: the server re-checks on submit
      );
    };
  }
}
