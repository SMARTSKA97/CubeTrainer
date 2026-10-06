import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { AuthApi } from '@core/auth/auth-api';

/** "Continue with Google / Microsoft / GitHub / Facebook". Shows only the providers the server has switched on. */
@Component({
  selector: 'app-social-buttons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .social {
      display: grid;
      gap: 8px;
      margin: 0 0 16px;
    }
    a.btn {
      text-align: center;
      text-decoration: none;
    }
    .or {
      text-align: center;
      font-size: 13px;
      margin: 4px 0 0;
    }
  `,
  template: `
    @if (providers().length) {
      <div class="social">
        @for (p of providers(); track p.id) {
          <a class="btn" [href]="api.externalStartUrl(p.id, returnUrl())"
            >Continue with {{ p.name }}</a
          >
        }
        <p class="or muted">or use your email</p>
      </div>
    }
  `,
})
export class SocialButtons {
  protected readonly api = inject(AuthApi);
  readonly returnUrl = input('/today');
  protected readonly providers = toSignal(this.api.providers().pipe(catchError(() => of([]))), {
    initialValue: [],
  });
}
