import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';
import { AuthStore } from '@core/auth/auth-store';
import { toProblem } from '@core/auth/auth-utils';
import { PasswordField } from '@shared/password-field';

@Component({
  selector: 'app-danger-section',
  imports: [ReactiveFormsModule, PasswordField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings.css',
  template: `
    <section class="card danger">
      <h2>Delete account</h2>
      <p class="muted">
        Permanently removes your account and profile from our servers. Solves stored on this device
        stay here. This cannot be undone.
      </p>
      @if (!open()) {
        <button class="btn" type="button" (click)="open.set(true)">Delete my account…</button>
      } @else {
        <form [formGroup]="form" (ngSubmit)="remove()" novalidate>
          @if (error(); as e) {
            <p class="banner error" role="alert">{{ e }}</p>
          }
          <app-password-field
            [control]="form.controls.password"
            label="Confirm with your password"
            autocomplete="current-password"
          />
          <div class="row">
            <button class="btn danger" type="submit" [disabled]="busy()">Delete permanently</button>
            <button class="btn" type="button" (click)="open.set(false)">Cancel</button>
          </div>
        </form>
      }
    </section>
  `,
})
export class DangerSection {
  private readonly api = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.group({ password: ['', Validators.required] });

  protected async remove(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.deleteAccount(this.form.controls.password.value));
      this.auth.expire();
      await this.router.navigateByUrl('/today');
    } catch (err) {
      this.error.set(toProblem(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
