import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
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
import { AuthStore } from '@core/auth/auth-store';
import { AuthResponse, CUBE_METHODS, ExternalTicket } from '@core/auth/auth.models';
import { regionFromLocale, toProblem } from '@core/auth/auth-utils';
import { countryOptions } from '@core/auth/countries';
import { AuthCard } from './auth-card';
import { safeReturnUrl } from './safe-redirect';

const HANDLE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

/** First sign-in with a provider: it told us who you are, we still need a username, country and birth year. */
@Component({
  selector: 'app-external-complete-page',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-form.css',
  template: `
    @if (sentTo(); as address) {
      <app-auth-card
        title="Check your email"
        [subtitle]="
          'We sent a confirmation link to ' +
          address +
          '. Open it, then sign in with ' +
          providerName() +
          ' again.'
        "
      >
        <p><a class="btn primary" routerLink="/auth/login">Back to sign in</a></p>
      </app-auth-card>
    } @else if (loadError()) {
      <app-auth-card title="This link has expired">
        <p class="banner error" role="alert">{{ loadError() }}</p>
        <div class="links"><a routerLink="/auth/login">Back to sign in</a></div>
      </app-auth-card>
    } @else if (ticketInfo(); as info) {
      <app-auth-card
        title="Almost there"
        [subtitle]="
          'You are signing up with ' + providerName() + '. Choose how you appear to other cubers.'
        "
      >
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error(); as e) {
            <p class="banner error" role="alert">{{ e }}</p>
          }
          @if (info.email) {
            <p class="muted">
              Email: {{ info.email
              }}{{ info.emailVerified ? '' : ' (we will ask you to confirm it)' }}
            </p>
          } @else {
            <label class="field">
              Email
              <input type="email" formControlName="email" autocomplete="email" />
              <span class="hint"
                >{{ providerName() }} did not share one. We will email you a confirmation
                link.</span
              >
            </label>
          }
          <div class="grid2">
            <label class="field"
              >Display name <input type="text" formControlName="displayName" maxlength="40"
            /></label>
            <label class="field"
              >Username
              <input
                type="text"
                formControlName="handle"
                maxlength="20"
                autocapitalize="off"
                spellcheck="false"
            /></label>
          </div>
          @if (form.controls.handle.pending) {
            <span class="hint">Checking username…</span>
          } @else if (form.controls.handle.errors?.['taken']) {
            <span class="err">That username is taken.</span>
          } @else if (form.controls.handle.errors?.['pattern'] && form.controls.handle.value) {
            <span class="err"
              >3-20 characters: letters, numbers, underscore; start with a letter.</span
            >
          }
          <div class="grid2">
            <label class="field"
              >Country
              <select formControlName="country">
                <option value="" disabled>Choose…</option>
                @for (c of countries; track c.code) {
                  <option [value]="c.code">{{ c.name }}</option>
                }
              </select>
            </label>
            <label class="field"
              >Birth year <input type="number" formControlName="birthYear" inputmode="numeric"
            /></label>
          </div>
          @if (ageProblem(); as a) {
            <span class="err">{{ a }}</span>
          }
          <div class="grid2">
            <label class="field"
              >Method
              <select formControlName="cubeMethod">
                <option value="">Prefer not to say</option>
                @for (m of methods; track m.value) {
                  <option [value]="m.value">{{ m.label }}</option>
                }
              </select>
            </label>
            <label class="field"
              >Years cubing <input type="number" formControlName="cubingYears" min="0" max="80"
            /></label>
          </div>
          <label class="check">
            <input type="checkbox" formControlName="acceptTerms" />
            <span
              >I agree to the <a routerLink="/legal/terms" target="_blank">Terms</a> and
              <a routerLink="/legal/privacy" target="_blank">Privacy Policy</a>.</span
            >
          </label>
          <button class="btn primary" type="submit" [disabled]="busy()">
            {{ busy() ? 'Creating account…' : 'Create account' }}
          </button>
        </form>
      </app-auth-card>
    } @else {
      <app-auth-card title="One moment"><p class="muted" role="status">Loading…</p></app-auth-card>
    }
  `,
})
export class ExternalCompletePage implements OnInit {
  private readonly api = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly ticket = input<string>();
  readonly returnUrl = input<string>();

  protected readonly countries = countryOptions(navigator.language || 'en');
  protected readonly methods = CUBE_METHODS;
  protected readonly ticketInfo = signal<ExternalTicket | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly sentTo = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly providerName = computed(() => {
    const p = this.ticketInfo()?.provider ?? '';
    return p ? p[0].toUpperCase() + p.slice(1) : 'your provider';
  });

  private readonly policy = toSignal(this.api.policy().pipe(catchError(() => of(null))), {
    initialValue: null,
  });

  protected readonly form = this.fb.group({
    email: [''],
    displayName: ['', [Validators.required, Validators.maxLength(40)]],
    handle: [
      '',
      {
        validators: [Validators.required, Validators.pattern(HANDLE)],
        asyncValidators: [this.handleFree()],
      },
    ],
    country: [regionFromLocale(navigator.language) ?? '', [Validators.required]],
    birthYear: [null as number | null, [Validators.required]],
    cubeMethod: [''],
    cubingYears: [null as number | null],
    acceptTerms: [false, [Validators.requiredTrue]],
  });

  private readonly birthYear = toSignal(this.form.controls.birthYear.valueChanges, {
    initialValue: null as number | null,
  });
  protected readonly ageProblem = computed(() => {
    const year = this.birthYear();
    const now = new Date().getFullYear();
    const min = this.policy()?.minimumAge ?? 13;
    if (year === null || String(year).length < 4) return null;
    if (year < now - 110 || year > now) return 'Enter a valid birth year.';
    return now - year < min
      ? `You must be at least ${min} to create an account. You can keep using CubeTrainer as a guest.`
      : null;
  });

  async ngOnInit(): Promise<void> {
    const ticket = this.ticket();
    if (!ticket) {
      this.loadError.set('This sign-up link is incomplete. Start again from the sign-in page.');
      return;
    }
    try {
      const info = await firstValueFrom(this.api.externalTicket(ticket));
      this.ticketInfo.set(info);
      if (info.name) this.form.controls.displayName.setValue(info.name.slice(0, 40));
      if (!info.email)
        this.form.controls.email.addValidators([Validators.required, Validators.email]);
    } catch (err) {
      this.loadError.set(toProblem(err).message);
    }
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.ageProblem() || this.form.controls.handle.pending) {
      this.error.set('Please fix the highlighted fields.');
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    try {
      const res = await firstValueFrom(
        this.api.externalComplete({
          ticket: this.ticket()!,
          email: v.email.trim() || null,
          displayName: v.displayName.trim(),
          handle: v.handle.trim(),
          country: v.country,
          birthYear: Number(v.birthYear),
          cubeMethod: v.cubeMethod || null,
          cubeModel: null,
          cubingYears:
            v.cubingYears === null || v.cubingYears === undefined ? null : Number(v.cubingYears),
          acceptTerms: v.acceptTerms,
        }),
      );
      if (res.status === 200 && res.body && 'accessToken' in res.body) {
        this.auth.acceptSession(res.body as AuthResponse);
        await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()), { replaceUrl: true });
      } else {
        this.sentTo.set(v.email.trim() || this.ticketInfo()?.email || 'your email address');
      }
    } catch (err) {
      const p = toProblem(err);
      this.error.set(p.details[0] ?? p.message);
      if (p.code === 'handle_taken') this.form.controls.handle.setErrors({ taken: true });
    } finally {
      this.busy.set(false);
    }
  }

  private handleFree(): AsyncValidatorFn {
    return (control: AbstractControl): ReturnType<AsyncValidatorFn> => {
      const value = String(control.value ?? '');
      if (!HANDLE.test(value)) return of(null);
      return timer(400).pipe(
        switchMap(() => this.api.handleAvailable(value)),
        map((r): ValidationErrors | null => (r.available ? null : { taken: true })),
        catchError(() => of(null)),
      );
    };
  }
}
