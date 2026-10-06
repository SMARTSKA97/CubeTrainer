import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '@core/auth/auth-store';
import { AuthCard } from './auth-card';
import { safeReturnUrl } from './safe-redirect';

/** The API has just set the sign-in cookie and sent the browser here; trade it for an access token and carry on. */
@Component({
  selector: 'app-external-done-page',
  imports: [RouterLink, AuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-form.css',
  template: `
    <app-auth-card title="Signing you in">
      @if (failed()) {
        <p class="banner error" role="alert">We could not finish signing you in.</p>
        <div class="links"><a routerLink="/auth/login">Back to sign in</a></div>
      } @else {
        <p class="muted" role="status">One moment…</p>
      }
    </app-auth-card>
  `,
})
export class ExternalDonePage implements OnInit {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly returnUrl = input<string>();
  protected readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    if (await this.auth.refresh())
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()), { replaceUrl: true });
    else this.failed.set(true);
  }
}
