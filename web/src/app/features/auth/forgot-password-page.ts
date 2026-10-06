import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';
import { toProblem } from '@core/auth/auth-utils';
import { AuthCard } from './auth-card';

@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-form.css',
  template: `
    <app-auth-card
      title="Forgot your password?"
      subtitle="Enter your account email and we will send you a link to choose a new one."
    >
      @if (sent()) {
        <p class="banner success" role="status">
          If an account exists for that address, a reset link is on its way. It works for 60
          minutes. Check your spam folder too.
        </p>
        <div class="links"><a routerLink="/auth/login">Back to sign in</a></div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error(); as e) {
            <p class="banner error" role="alert">{{ e }}</p>
          }
          <label class="field">
            Email
            <input type="email" formControlName="email" autocomplete="email" inputmode="email" />
          </label>
          <button class="btn primary" type="submit" [disabled]="busy()">
            {{ busy() ? 'Sending…' : 'Send reset link' }}
          </button>
          <div class="links"><a routerLink="/auth/login">Back to sign in</a></div>
        </form>
      }
    </app-auth-card>
  `,
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(AuthApi);

  protected readonly form = this.fb.group({ email: ['', [Validators.required, Validators.email]] });
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    this.error.set(null);
    if (this.form.invalid) {
      this.error.set('Enter a valid email address.');
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.forgotPassword(this.form.controls.email.value.trim()));
      this.sent.set(true);
    } catch (err) {
      this.error.set(toProblem(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
