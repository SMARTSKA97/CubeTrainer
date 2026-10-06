import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/** Placeholder policy pages. Replace with reviewed text before public launch. */
@Component({
  selector: 'app-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      max-width: 720px;
      margin: 0 auto;
    }
    .card {
      padding: 24px;
      line-height: 1.6;
    }
  `,
  template: `
    <section class="card">
      <h1>{{ kind === 'terms' ? 'Terms of Use' : 'Privacy Policy' }}</h1>
      <p class="banner">Draft: this text is a placeholder and has not been legally reviewed.</p>
      @if (kind === 'terms') {
        <p>
          CubeTrainer is a free practice tool provided as is. You are responsible for keeping your
          password safe. Do not misuse the service or other people's accounts.
        </p>
      } @else {
        <p>
          We store the account details you give us (email, display name, username, country, birth
          year and optional cubing profile) to run your account, keep your history and, later, show
          leaderboards you opt in to. Only your birth year is stored, never your full date of birth.
          You can edit or delete your account at any time in Settings.
        </p>
        <p>
          Passwords are stored only as salted hashes. Emails are used for account messages, not
          marketing.
        </p>
      }
    </section>
  `,
})
export class LegalPage {
  protected readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as 'terms' | 'privacy';
}
