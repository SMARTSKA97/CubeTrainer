import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '@core/auth/auth-store';
import { toProblem } from '@core/auth/auth-utils';
import { AuthCard } from './auth-card';
import { safeReturnUrl } from './safe-redirect';

/** Second sign-in step, for both password and social sign-in: a 6-digit app code, or a one-time recovery code. */
@Component({
  selector: 'app-two-factor-page',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-form.css',
  template: `
    <app-auth-card
      title="Two-step verification"
      subtitle="Open your authenticator app and enter the 6-digit code for CubeTrainer."
    >
      @if (!challenge()) {
        <p class="banner error" role="alert">This link is not valid any more.</p>
        <div class="links"><a routerLink="/auth/login">Back to sign in</a></div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (failure(); as e) {
            <p class="banner error" role="alert">{{ e }}</p>
          }
          <label class="field">
            Code
            <input
              formControlName="code"
              autocomplete="one-time-code"
              inputmode="text"
              autocapitalize="characters"
              spellcheck="false"
              placeholder="123456"
            />
          </label>
          <p class="muted">Lost your phone? Enter one of your recovery codes instead.</p>
          <button class="btn primary" type="submit" [disabled]="busy()">
            {{ busy() ? 'Checking…' : 'Verify' }}
          </button>
          <div class="links"><a routerLink="/auth/login">Start over</a></div>
        </form>
      }
    </app-auth-card>
  `,
})
export class TwoFactorPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly challenge = input<string>();
  readonly returnUrl = input<string>();
  protected readonly form = this.fb.group({ code: ['', Validators.required] });
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected async submit(): Promise<void> {
    const challenge = this.challenge();
    if (!challenge) return;
    this.failure.set(null);
    const code = this.form.controls.code.value.trim();
    if (!code) {
      this.failure.set('Enter the code from your authenticator app.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.completeTwoFactor(challenge, code);
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()), { replaceUrl: true });
    } catch (err) {
      const p = toProblem(err);
      this.failure.set(p.message);
      if (p.code === 'challenge_expired') this.form.disable();
    } finally {
      this.busy.set(false);
    }
  }
}
