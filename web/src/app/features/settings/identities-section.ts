import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';
import { IdentitiesView, ProviderInfo } from '@core/auth/auth.models';
import { externalErrorMessage, toProblem } from '@core/auth/auth-utils';

/** Connect or disconnect Google / Microsoft / GitHub / Facebook. Only providers the server has switched on are listed. */
@Component({
  selector: 'app-identities-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings.css',
  template: `
    @if (providers().length) {
      <section class="card">
        <h2>Connected accounts</h2>
        <p class="muted">Sign in faster with an account you already have.</p>
        @if (message(); as m) {
          <p class="banner" role="status">{{ m }}</p>
        }
        @if (error(); as e) {
          <p class="banner error" role="alert">{{ e }}</p>
        }
        <ul class="sessions">
          @for (p of providers(); track p.id) {
            <li>
              <span>
                <strong>{{ p.name }}</strong>
                @if (linkOf(p.id); as l) {
                  <span class="muted"> · connected{{ l.email ? ' as ' + l.email : '' }}</span>
                }
              </span>
              @if (linkOf(p.id)) {
                <button class="btn small" type="button" (click)="unlink(p)" [disabled]="busy()">
                  Disconnect
                </button>
              } @else {
                <button class="btn small" type="button" (click)="link(p)" [disabled]="busy()">
                  Connect
                </button>
              }
            </li>
          }
        </ul>
        @if (view() && !view()!.hasPassword) {
          <p class="muted">You have no password. To add one, sign out and use "Forgot password".</p>
        }
      </section>
    }
  `,
})
export class IdentitiesSection {
  private readonly api = inject(AuthApi);
  /** From the ?linked= / ?linkError= query after returning from a provider. */
  readonly linked = input<string>();
  readonly linkError = input<string>();

  protected readonly providers = signal<ProviderInfo[]>([]);
  protected readonly view = signal<IdentitiesView | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = computed(() =>
    this.linked() ? `Connected ${this.linked()}.` : null,
  );

  constructor() {
    void this.load();
  }

  protected linkOf(id: string) {
    return this.view()?.linked.find((l) => l.provider === id);
  }

  private async load(): Promise<void> {
    try {
      this.providers.set(await firstValueFrom(this.api.providers()));
      this.view.set(await firstValueFrom(this.api.identities()));
    } catch {
      /* section stays hidden */
    }
    const code = this.linkError();
    if (code) this.error.set(externalErrorMessage(code));
  }

  protected async link(p: ProviderInfo): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { url } = await firstValueFrom(this.api.linkStart(p.id));
      window.location.assign(url);
    } catch (err) {
      this.error.set(toProblem(err).message);
      this.busy.set(false);
    }
  }

  protected async unlink(p: ProviderInfo): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.unlink(p.id));
      this.view.set(await firstValueFrom(this.api.identities()));
    } catch (err) {
      this.error.set(toProblem(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
