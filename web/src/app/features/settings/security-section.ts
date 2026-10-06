import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';
import { AuthStore } from '@core/auth/auth-store';
import { SessionInfo } from '@core/auth/auth.models';
import { describeAgent, toProblem } from '@core/auth/auth-utils';
import { PasswordField } from '@shared/password-field';

@Component({
  selector: 'app-security-section',
  imports: [ReactiveFormsModule, DatePipe, PasswordField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings.css',
  template: `
    <section class="card">
      <h2>Password</h2>
      <form [formGroup]="form" (ngSubmit)="change()" novalidate>
        @if (error(); as e) {
          <p class="banner error" role="alert">{{ e }}</p>
        }
        @if (done()) {
          <p class="banner">Password changed. Your other devices were signed out.</p>
        }
        <app-password-field
          [control]="form.controls.current"
          label="Current password"
          autocomplete="current-password"
        />
        <app-password-field
          [control]="form.controls.next"
          label="New password"
          autocomplete="new-password"
          [showStrength]="true"
        />
        <div class="row">
          <button class="btn primary" type="submit" [disabled]="busy()">Change password</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Where you're signed in</h2>
      @if (sessions().length === 0) {
        <p class="muted">Loading…</p>
      }
      <ul class="sessions">
        @for (s of sessions(); track s.sessionId) {
          <li>
            <span>
              <strong>{{ agent(s.userAgent) }}</strong>
              @if (s.isCurrent) {
                <em> (this device)</em>
              }
              <br />
              <span class="muted"
                >Signed in {{ s.signedInAt | date: 'medium' }} · last active
                {{ s.lastActiveAt | date: 'medium' }}</span
              >
            </span>
            @if (!s.isCurrent) {
              <button class="btn small" type="button" (click)="revoke(s)">Sign out</button>
            }
          </li>
        }
      </ul>
      <p class="row">
        <button class="btn" type="button" (click)="everywhere()">Sign out everywhere</button>
      </p>
    </section>

    <section class="card">
      <h2>Two-step verification</h2>
      <p class="muted">
        Authenticator-app codes are coming next. Linked accounts (Google, Microsoft, GitHub) arrive
        after that.
      </p>
    </section>
  `,
})
export class SecuritySection {
  private readonly api = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly agent = describeAgent;
  protected readonly sessions = signal<SessionInfo[]>([]);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.group({
    current: ['', Validators.required],
    next: ['', [Validators.required, Validators.minLength(10)]],
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.sessions.set(await firstValueFrom(this.api.sessions()));
    } catch {
      this.sessions.set([]);
    }
  }

  protected async change(): Promise<void> {
    this.done.set(false);
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Enter your current password and a new one of at least 10 characters.');
      return;
    }
    this.busy.set(true);
    try {
      const v = this.form.getRawValue();
      await firstValueFrom(this.api.changePassword(v.current, v.next));
      this.form.reset();
      this.done.set(true);
      await this.load();
    } catch (err) {
      const p = toProblem(err);
      this.error.set(p.details[0] ?? p.message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async revoke(s: SessionInfo): Promise<void> {
    await firstValueFrom(this.api.revokeSession(s.sessionId));
    await this.load();
  }

  protected async everywhere(): Promise<void> {
    await firstValueFrom(this.api.logoutEverywhere());
    this.auth.expire();
    window.location.assign('/auth/login');
  }
}
