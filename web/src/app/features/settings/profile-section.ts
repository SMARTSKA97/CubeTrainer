import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';
import { AuthStore } from '@core/auth/auth-store';
import { CUBE_METHODS, ProfileUpdatePayload } from '@core/auth/auth.models';
import { toProblem } from '@core/auth/auth-utils';
import { countryOptions } from '@core/auth/countries';

@Component({
  selector: 'app-profile-section',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings.css',
  template: `
    <section class="card">
      <h2>Profile</h2>
      <p class="muted">
        Signed in as {{ user()?.email }} · &#64;{{ user()?.handle }}
        @if (!user()?.emailConfirmed) {
          · <strong>email not confirmed</strong>
        }
      </p>
      <form [formGroup]="form" (ngSubmit)="save()">
        @if (error(); as e) {
          <p class="banner error" role="alert">{{ e }}</p>
        }
        <label class="field"
          >Display name <input type="text" formControlName="displayName" maxlength="40"
        /></label>
        <label class="field"
          >Country
          <select formControlName="country">
            @for (c of countries; track c.code) {
              <option [value]="c.code">{{ c.name }}</option>
            }
          </select>
        </label>
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
        <label class="field"
          >Main cube <input type="text" formControlName="cubeModel" maxlength="60"
        /></label>
        <label class="check"
          ><input type="checkbox" formControlName="leaderboardOptIn" /> Show me on public
          leaderboards (when they launch)</label
        >
        <div class="row">
          <button class="btn primary" type="submit" [disabled]="busy() || form.pristine">
            {{ busy() ? 'Saving…' : 'Save changes' }}
          </button>
          @if (saved()) {
            <span class="ok">Saved.</span>
          }
        </div>
      </form>
    </section>
  `,
})
export class ProfileSection {
  private readonly api = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly user = this.auth.user;
  protected readonly countries = countryOptions(navigator.language || 'en');
  protected readonly methods = CUBE_METHODS;
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    displayName: [this.user()?.displayName ?? '', [Validators.required, Validators.maxLength(40)]],
    country: [this.user()?.country ?? ''],
    cubeMethod: [this.user()?.cubeMethod ?? ''],
    cubeModel: [this.user()?.cubeModel ?? ''],
    cubingYears: [this.yearsOf()],
    leaderboardOptIn: [this.user()?.leaderboardOptIn ?? false],
  });

  private yearsOf(): number | null {
    const since = this.user()?.cubingSinceYear;
    return since ? Math.max(0, new Date().getFullYear() - since) : null;
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const years =
      v.cubingYears === null || (v.cubingYears as unknown) === '' ? null : Number(v.cubingYears);
    const body: ProfileUpdatePayload = {
      displayName: v.displayName.trim(),
      country: v.country,
      leaderboardOptIn: v.leaderboardOptIn,
      cubeMethod: v.cubeMethod || null,
      clearCubeMethod: !v.cubeMethod,
      cubeModel: v.cubeModel.trim() || null,
      clearCubeModel: !v.cubeModel.trim(),
      cubingYears: years,
      clearCubingYears: years === null,
    };
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      this.auth.setUser(await firstValueFrom(this.api.updateProfile(body)));
      this.form.markAsPristine();
      this.saved.set(true);
    } catch (err) {
      this.error.set(toProblem(err).details[0] ?? toProblem(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
