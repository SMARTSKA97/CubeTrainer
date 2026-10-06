import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';
import { AuthStore } from '@core/auth/auth-store';
import { externalErrorMessage, toProblem } from '@core/auth/auth-utils';
import { PasswordField } from '@shared/password-field';
import { AuthCard } from './auth-card';
import { SocialButtons } from './social-buttons';
import { safeReturnUrl } from './safe-redirect';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, AuthCard, PasswordField, SocialButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-form.css',
  template: `
    <app-auth-card
      title="Sign in"
      subtitle="Welcome back. Your solves stay on this device until you sign in on another one."
    >
      <app-social-buttons [returnUrl]="safeReturn()" />
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (shownError(); as e) {
          <p class="banner error" role="alert">{{ e }}</p>
        }
        @if (notVerified()) {
          <p class="banner">
            @if (resent()) {
              We sent a new confirmation link. Check your inbox (and spam folder).
            } @else {
              <button type="button" class="btn small" (click)="resend()" [disabled]="busy()">
                Send the confirmation link again
              </button>
            }
          </p>
        }
        <label class="field">
          Email
          <input type="email" formControlName="email" autocomplete="email" inputmode="email" />
        </label>
        <app-password-field
          [control]="form.controls.password"
          label="Password"
          autocomplete="current-password"
        />
        <button class="btn primary" type="submit" [disabled]="busy()">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>
        <div class="links">
          <a routerLink="/auth/forgot-password">Forgot password?</a>
          <a routerLink="/auth/register">Create an account</a>
        </div>
        <div class="links"><a routerLink="/today">Continue as guest</a></div>
      </form>
    </app-auth-card>
  `,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(AuthStore);
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);

  /** Bound from the ?returnUrl= query parameter. */
  readonly returnUrl = input<string>();
  /** Bound from ?error=<code> after a failed social sign-in. */
  readonly error = input<string>();
  protected readonly safeReturn = computed(() => safeReturnUrl(this.returnUrl()));

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly shownError = computed(
    () => this.failure() ?? externalErrorMessage(this.error()),
  );
  protected readonly notVerified = signal(false);
  protected readonly resent = signal(false);

  protected async submit(): Promise<void> {
    this.failure.set(null);
    this.notVerified.set(false);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.failure.set('Enter your email and password.');
      return;
    }
    this.busy.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email.trim(), password);
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (err) {
      const p = toProblem(err);
      this.notVerified.set(p.code === 'email_not_verified');
      this.failure.set(p.message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async resend(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.resendVerification(this.form.controls.email.value.trim()));
      this.resent.set(true);
    } catch (err) {
      this.failure.set(toProblem(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
