import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';
import { toProblem } from '@core/auth/auth-utils';
import { AuthCard } from './auth-card';

@Component({
  selector: 'app-verify-email-page',
  imports: [RouterLink, AuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-form.css',
  template: `
    <app-auth-card title="Confirming your email">
      @switch (state()) {
        @case ('working') {
          <p class="muted" role="status">One moment…</p>
        }
        @case ('ok') {
          <p class="banner success" role="status">Your email is confirmed. You can sign in now.</p>
          <p><a class="btn primary" routerLink="/auth/login">Sign in</a></p>
        }
        @case ('error') {
          <p class="banner error" role="alert">{{ message() }}</p>
          <div class="links">
            <a routerLink="/auth/login">Sign in to get a new link</a>
            <a routerLink="/today">Continue as guest</a>
          </div>
        }
      }
    </app-auth-card>
  `,
})
export class VerifyEmailPage implements OnInit {
  private readonly api = inject(AuthApi);

  /** Bound from the ?token= query parameter in the emailed link. */
  readonly token = input<string>();

  protected readonly state = signal<'working' | 'ok' | 'error'>('working');
  protected readonly message = signal('');

  async ngOnInit(): Promise<void> {
    const token = this.token();
    if (!token) {
      this.message.set('This link is incomplete. Open the link from your email again.');
      this.state.set('error');
      return;
    }
    try {
      await firstValueFrom(this.api.verifyEmail(token));
      this.state.set('ok');
    } catch (err) {
      this.message.set(toProblem(err).message);
      this.state.set('error');
    }
  }
}
