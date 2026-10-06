import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';
import { toProblem } from '@core/auth/auth-utils';
import { PasswordField } from '@shared/password-field';
import { AuthCard } from './auth-card';

@Component({
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthCard, PasswordField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-form.css',
  template: `
    <app-auth-card
      title="Choose a new password"
      subtitle="You will be signed out everywhere else once it is changed."
    >
      @if (done()) {
        <p class="banner success" role="status">Password changed. You can sign in with it now.</p>
        <div class="links"><a routerLink="/auth/login">Go to sign in</a></div>
      } @else if (!token()) {
        <p class="banner error" role="alert">
          This link is incomplete. Open the link from your email again, or request a new one.
        </p>
        <div class="links"><a routerLink="/auth/forgot-password">Request a new link</a></div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error(); as e) {
            <p class="banner error" role="alert">{{ e }}</p>
          }
          @if (expired()) {
            <div class="links"><a routerLink="/auth/forgot-password">Request a new link</a></div>
          }
          <app-password-field
            [control]="form.controls.password"
            label="New password"
            autocomplete="new-password"
            [showStrength]="true"
          />
          <p class="hint">
            At least 10 characters. A few random words make a strong, memorable password.
          </p>
          <button class="btn primary" type="submit" [disabled]="busy()">
            {{ busy() ? 'Saving…' : 'Change password' }}
          </button>
        </form>
      }
    </app-auth-card>
  `,
})
export class ResetPasswordPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(AuthApi);

  /** Bound from the ?token= query parameter in the emailed link. */
  readonly token = input<string>();

  protected readonly form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(10)]],
  });
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly expired = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    this.error.set(null);
    if (this.form.invalid) {
      this.error.set('Use at least 10 characters.');
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.resetPassword(this.token()!, this.form.controls.password.value),
      );
      this.done.set(true);
    } catch (err) {
      const p = toProblem(err);
      this.expired.set(p.code === 'invalid_token');
      this.error.set(p.details[0] ?? p.message);
    } finally {
      this.busy.set(false);
    }
  }
}
