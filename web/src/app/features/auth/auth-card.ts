import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The centred card every sign-in screen sits in. */
@Component({
  selector: 'app-auth-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card auth">
      <h1>{{ title() }}</h1>
      @if (subtitle()) {
        <p class="muted sub">{{ subtitle() }}</p>
      }
      <ng-content />
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .auth {
      max-width: 460px;
      margin: 24px auto;
      padding: 24px;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 4px;
    }
    .sub {
      margin: 0 0 18px;
      line-height: 1.5;
    }
  `,
})
export class AuthCard {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
