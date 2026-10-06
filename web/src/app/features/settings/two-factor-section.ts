import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';
import { AuthStore } from '@core/auth/auth-store';
import { TwoFactorSetup, TwoFactorStatus } from '@core/auth/auth.models';
import { recoveryCodesText, toProblem } from '@core/auth/auth-utils';
import { PasswordField } from '@shared/password-field';

type Mode = 'idle' | 'setup' | 'codes' | 'disable' | 'regen';

/** Authenticator-app (TOTP) two-step verification: set up, show recovery codes once, regenerate, turn off. */
@Component({
  selector: 'app-two-factor-section',
  imports: [ReactiveFormsModule, PasswordField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings.css',
  template: `
    <section class="card" id="two-factor">
      <h2>Two-step verification</h2>
      @if (error(); as e) {
        <p class="banner error" role="alert">{{ e }}</p>
      }
      @if (message(); as m) {
        <p class="banner" role="status">{{ m }}</p>
      }

      @switch (mode()) {
        @case ('setup') {
          <p>
            1. Scan this QR code with an authenticator app (Google Authenticator, Microsoft
            Authenticator, Aegis, 1Password…).
          </p>
          @if (qr(); as src) {
            <img class="qr" [src]="src" width="200" height="200" alt="QR code to add CubeTrainer" />
          }
          <p class="muted">
            Can't scan? Enter this key by hand:
            <code class="secret" data-testid="secret">{{ setup()?.secret }}</code>
          </p>
          <form [formGroup]="codeForm" (ngSubmit)="enable()" novalidate>
            <label class="field">
              2. Enter the 6-digit code the app shows
              <input
                formControlName="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="123456"
              />
            </label>
            <div class="row">
              <button class="btn primary" type="submit" [disabled]="busy()">Turn on</button>
              <button class="btn" type="button" (click)="cancel()">Cancel</button>
            </div>
          </form>
        }
        @case ('codes') {
          <p>
            <strong>Save your recovery codes.</strong> Each works once if you lose your phone. They
            are shown only now.
          </p>
          <ul class="codes" data-testid="recovery-codes">
            @for (c of codes(); track c) {
              <li>
                <code>{{ c }}</code>
              </li>
            }
          </ul>
          <div class="row">
            <button class="btn" type="button" (click)="copy()">Copy</button>
            <button class="btn" type="button" (click)="download()">Download</button>
            <button class="btn primary" type="button" (click)="finish()">I saved them</button>
          </div>
        }
        @case ('disable') {
          <form [formGroup]="disableForm" (ngSubmit)="disable()" novalidate>
            <p>Turning this off makes your account easier to take over.</p>
            @if (hasPassword()) {
              <app-password-field
                [control]="disableForm.controls.password"
                label="Password"
                autocomplete="current-password"
              />
            }
            <label class="field">
              Code from your app (or a recovery code)
              <input formControlName="code" autocomplete="one-time-code" placeholder="123456" />
            </label>
            <div class="row">
              <button class="btn danger" type="submit" [disabled]="busy()">Turn off</button>
              <button class="btn" type="button" (click)="cancel()">Cancel</button>
            </div>
          </form>
        }
        @case ('regen') {
          <form [formGroup]="codeForm" (ngSubmit)="regenerate()" novalidate>
            <p>New codes replace the old ones, which stop working.</p>
            <label class="field">
              Code from your app
              <input formControlName="code" autocomplete="one-time-code" placeholder="123456" />
            </label>
            <div class="row">
              <button class="btn primary" type="submit" [disabled]="busy()">Make new codes</button>
              <button class="btn" type="button" (click)="cancel()">Cancel</button>
            </div>
          </form>
        }
        @default {
          @if (status(); as s) {
            @if (s.enabled) {
              <p>
                <strong>On.</strong> You'll be asked for a code from your app when you sign in.
                <span class="muted"
                  >{{ s.recoveryCodesLeft }} recovery
                  {{ s.recoveryCodesLeft === 1 ? 'code' : 'codes' }} left.</span
                >
              </p>
              <div class="row">
                <button class="btn" type="button" (click)="open('regen')">
                  New recovery codes
                </button>
                <button class="btn" type="button" (click)="open('disable')">Turn off</button>
              </div>
            } @else {
              <p class="muted">
                Add a second step so a stolen password alone can't open your account.
              </p>
              @if (hasPassword()) {
                <form [formGroup]="startForm" (ngSubmit)="begin()" novalidate>
                  <app-password-field
                    [control]="startForm.controls.password"
                    label="Confirm your password"
                    autocomplete="current-password"
                  />
                  <div class="row">
                    <button class="btn primary" type="submit" [disabled]="busy()">Set up</button>
                  </div>
                </form>
              } @else {
                <div class="row">
                  <button class="btn primary" type="button" (click)="begin()" [disabled]="busy()">
                    Set up
                  </button>
                </div>
              }
            }
          } @else {
            <p class="muted">Loading…</p>
          }
        }
      }
    </section>
  `,
})
export class TwoFactorSection {
  private readonly api = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly status = signal<TwoFactorStatus | null>(null);
  protected readonly mode = signal<Mode>('idle');
  protected readonly setup = signal<TwoFactorSetup | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly codes = signal<string[]>([]);
  protected readonly hasPassword = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly startForm = this.fb.group({ password: '' });
  protected readonly codeForm = this.fb.group({ code: '' });
  protected readonly disableForm = this.fb.group({ password: '', code: '' });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [status, identities] = await Promise.all([
        firstValueFrom(this.api.twoFactorStatus()),
        firstValueFrom(this.api.identities()),
      ]);
      this.status.set(status);
      this.hasPassword.set(identities.hasPassword);
    } catch (err) {
      this.error.set(toProblem(err).message);
    }
  }

  protected open(mode: Mode): void {
    this.reset();
    this.mode.set(mode);
  }

  protected cancel(): void {
    this.reset();
    this.mode.set('idle');
  }

  private reset(): void {
    this.error.set(null);
    this.message.set(null);
    this.codeForm.reset();
    this.disableForm.reset();
    this.startForm.reset();
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.message.set(null);
    this.busy.set(true);
    try {
      await work();
    } catch (err) {
      const p = toProblem(err);
      this.error.set(p.details[0] ?? p.message);
    } finally {
      this.busy.set(false);
    }
  }

  protected begin(): Promise<void> {
    return this.run(async () => {
      const password = this.hasPassword() ? this.startForm.controls.password.value : null;
      const setup = await firstValueFrom(this.api.twoFactorSetup(password));
      const mod = await import('qrcode');
      // the library is CommonJS: depending on the bundler its functions sit on the namespace or on `default`
      const toDataURL =
        mod.toDataURL ?? (mod as unknown as { default: typeof mod }).default.toDataURL;
      this.qr.set(await toDataURL(setup.otpAuthUri, { margin: 1, width: 200 }));
      this.setup.set(setup);
      this.mode.set('setup');
    });
  }

  protected enable(): Promise<void> {
    return this.run(async () => {
      const set = await firstValueFrom(this.api.twoFactorEnable(this.codeForm.controls.code.value));
      this.setup.set(null);
      this.qr.set(null);
      this.codes.set(set.codes);
      this.mode.set('codes');
      await this.refreshUser();
    });
  }

  protected regenerate(): Promise<void> {
    return this.run(async () => {
      const set = await firstValueFrom(
        this.api.twoFactorRecoveryCodes(this.codeForm.controls.code.value),
      );
      this.codes.set(set.codes);
      this.mode.set('codes');
    });
  }

  protected disable(): Promise<void> {
    return this.run(async () => {
      const v = this.disableForm.getRawValue();
      await firstValueFrom(
        this.api.twoFactorDisable(this.hasPassword() ? v.password : null, v.code),
      );
      this.mode.set('idle');
      this.message.set('Two-step verification is off.');
      await this.refreshUser();
      await this.load();
    });
  }

  protected finish(): void {
    this.codes.set([]);
    this.mode.set('idle');
    this.message.set('Two-step verification is on.');
    void this.load();
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.codes().join('\n'));
      this.message.set('Copied.');
    } catch {
      this.error.set('Could not copy. Select the codes and copy them by hand.');
    }
  }

  protected download(): void {
    const text = recoveryCodesText(this.codes(), this.auth.user()?.email ?? 'your account');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cubetrainer-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  private async refreshUser(): Promise<void> {
    try {
      this.auth.setUser(await firstValueFrom(this.api.me()));
    } catch {
      /* the badge is cosmetic */
    }
  }
}
