import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { contact } from '@core/config';

/** Bump together with Auth:TermsVersion on the API whenever the text below changes in a way people should agree to again. */
export const LEGAL_VERSION = '2026-10';
export const LEGAL_UPDATED = '7 October 2026';

/**
 * The Terms of Use and Privacy Policy. Written to match what the app really does (see docs/adr and the code);
 * if behaviour changes, change this text. Not a substitute for advice from a lawyer.
 */
@Component({
  selector: 'app-legal-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      line-height: 1.6;
    }
    h1 {
      margin: 0 0 4px;
    }
    h2 {
      font-size: 17px;
      margin: 22px 0 6px;
    }
    p,
    ul {
      margin: 6px 0;
    }
    ul {
      padding-left: 20px;
    }
    .meta {
      color: var(--muted);
      font-size: 14px;
      margin: 0 0 10px;
    }
    .short {
      border: 1px solid var(--line);
      background: var(--bg);
      border-radius: 10px;
      padding: 10px 14px;
      margin: 12px 0;
    }
  `,
  template: `
    @if (kind() === 'terms') {
      <h1>Terms of Use</h1>
      <p class="meta">Version {{ version }} · last updated {{ updated }}</p>
      <div class="short">
        <strong>In short:</strong> CubeTrainer is a free practice tool. Be honest on the
        leaderboards, look after your password, be kind to other people and to the service. You can
        leave and delete everything at any time.
      </div>

      <h2>1. Who runs this</h2>
      <p>
        CubeTrainer (a Rubik's cube timer, case trainer and daily practice tool) is run by
        {{ c.operator }} ("we", "us"). Questions: {{ c.email }}.
      </p>

      <h2>2. Who can use it</h2>
      <p>
        You can use CubeTrainer without an account (your solves then stay on your device). To create
        an account you must be at least 13 years old. If you are under 18, you need your parent's or
        guardian's permission, and by creating an account you confirm you have it. Please give us
        true details (birth year and country): we use them to apply the age rule and for optional
        leaderboard filters.
      </p>

      <h2>3. Your account</h2>
      <p>
        Keep your password and two-step verification codes to yourself. You are responsible for what
        happens through your account. Tell us if you think someone else is using it. One person, one
        account.
      </p>

      <h2>4. Acceptable use</h2>
      <ul>
        <li>Do not submit made-up or edited times, or use tools that cheat on leaderboards.</li>
        <li>
          Do not pick a username or display name that is offensive, misleading or impersonates
          someone.
        </li>
        <li>
          Do not attack, overload, scrape or try to break into the service or other people's
          accounts.
        </li>
        <li>Do not use it for anything unlawful.</li>
      </ul>
      <p>
        We may remove leaderboard entries, change a username, or suspend an account that breaks
        these rules.
      </p>

      <h2>5. Leaderboards</h2>
      <p>
        Leaderboards are optional: you appear only if you turn them on (and have confirmed your
        email). We then show your username, country, method and best times. Times are reported by
        the app and cannot be independently verified, so treat the boards as friendly competition.
        You can turn it off any time and you disappear at once.
      </p>

      <h2>6. Your solves and data</h2>
      <p>
        Your solves, progress and settings are yours. You give us permission to store and process
        them only to run CubeTrainer for you (sync, statistics, leaderboards you joined). You can
        download a copy or delete everything in Settings. See the Privacy Policy for details.
      </p>

      <h2>7. The service</h2>
      <p>
        CubeTrainer is free and provided "as is", without promises that it will always be available
        or error-free. We may change, pause or stop features. Keep your own export if your data
        matters to you. To the extent the law allows, we are not responsible for losses that come
        from using, or being unable to use, the service. Nothing here limits rights you have under
        law that cannot be limited.
      </p>

      <h2>8. Ending</h2>
      <p>
        You can delete your account in Settings at any time. We may suspend or close accounts that
        break these terms or put the service or others at risk.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these terms. The version and date above show the current text. If a change is
        important, we will say so in the app and, where the law requires it, ask you to agree again.
        Continuing to use CubeTrainer after a change means you accept it.
      </p>

      <h2>10. Law</h2>
      <p>These terms are governed by the laws of India.</p>

      <h2>11. Contact</h2>
      <p>{{ c.email }}</p>
    } @else {
      <h1>Privacy Policy</h1>
      <p class="meta">Version {{ version }} · last updated {{ updated }}</p>
      <div class="short">
        <strong>In short:</strong> to make an account we ask only for your email, name, country and
        year of birth (plus a username and a password). We use them to run your account, keep your
        solves in sync and, if you opt in, show you on leaderboards. No ads, no tracking, no selling
        data.
      </div>

      <h2>1. Who is responsible</h2>
      <p>
        {{ c.operator }} decides why and how your data is used (the "data fiduciary" under India's
        Digital Personal Data Protection Act, 2023). Contact for any privacy question or complaint:
        {{ c.email }}.
      </p>

      <h2>2. What we collect</h2>
      <p><strong>When you create an account</strong></p>
      <ul>
        <li>
          Email address (to confirm it is yours, reset your password and send account notices).
        </li>
        <li>Password, stored only as a salted hash, never in readable form.</li>
        <li>Display name and a unique username.</li>
        <li>Country.</li>
        <li>
          Year of birth (not your full date of birth), to apply the minimum age and for optional
          filters.
        </li>
        <li>Optional: your cubing method, cube model and the year you started.</li>
      </ul>
      <p><strong>When you use the app</strong></p>
      <ul>
        <li>
          Your solves (time, scramble, penalty, cube and method, when it happened), your progress in
          the case trainer, and your settings, so they follow you across devices.
        </li>
        <li>
          Sign-in security: a list of your signed-in devices with a browser/device description, an
          approximate time of last use and the IP address, failed sign-in counts, and if you turn on
          two-step verification, the secret (stored encrypted) and recovery codes (stored hashed).
        </li>
        <li>
          If you sign in with Google, Microsoft, GitHub or Facebook we receive your email, name and
          that provider's account id. We receive nothing else and never post for you.
        </li>
      </ul>
      <p>
        <strong>What we do not collect:</strong> phone number, address, payment details, precise
        location, contacts, photos, advertising identifiers or browsing history.
      </p>
      <p>
        Without an account (guest mode) your solves stay only on your device and are not sent to us.
      </p>

      <h2>3. Why we use it</h2>
      <ul>
        <li>To provide your account, sync, statistics and practice features.</li>
        <li>
          To send emails you need: confirm your address, reset your password, security notices. No
          marketing.
        </li>
        <li>To show you on leaderboards, only if you opt in and have confirmed your email.</li>
        <li>To keep the service safe: limit abuse, spot stolen sessions, enforce the age rule.</li>
      </ul>
      <p>
        We ask for your agreement when you create the account, and you can withdraw it by deleting
        your account.
      </p>

      <h2>4. What other people can see</h2>
      <p>
        Nothing, unless you join a leaderboard. Then the public sees your username, country, method
        and best times. Your email, name, birth year and sessions are never shown.
      </p>

      <h2>5. Who we share data with</h2>
      <p>
        We do not sell or rent your data and show no advertising. We use these services to run the
        app; they handle data only on our behalf:
      </p>
      <ul>
        <li>Render (hosts the server) and Neon (hosts the database).</li>
        <li>Cloudflare (hosts the website).</li>
        <li>Brevo (sends our emails).</li>
        <li>
          The sign-in provider you choose, if any (it learns that you signed in to CubeTrainer).
        </li>
      </ul>
      <p>
        These companies may run servers outside India. We may also disclose data if a law or a valid
        legal order requires it.
      </p>

      <h2>5a. Cookies and storage</h2>
      <p>
        We use one essential cookie that keeps you signed in (it cannot be read by page scripts) and
        your browser's local storage for guest solves, settings and offline use. In the Android app
        the sign-in token is kept in the app's private storage. We use no analytics or advertising
        cookies.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>Account data and solves: while your account exists.</li>
        <li>
          Solves you delete: removed for good from our servers after 90 days (a short delay keeps
          your devices in sync).
        </li>
        <li>Signed-in device records expire on their own (at most 90 days after you sign in).</li>
        <li>
          Delete your account in Settings and your profile, solves, sessions and linked sign-ins are
          removed immediately. Hosting providers' routine backups may keep a copy for a short time
          before they are overwritten.
        </li>
      </ul>

      <h2>7. Your rights</h2>
      <ul>
        <li>See and download your data: Settings, Your data, Download my data.</li>
        <li>Correct your details: Settings.</li>
        <li>Delete your account and data: Settings, Delete account.</li>
        <li>Leave the leaderboards: Settings or the Leaderboards page.</li>
        <li>
          Ask a question, complain or ask for help: write to {{ c.email }}. If you are not satisfied
          with our answer you may complain to the Data Protection Board of India.
        </li>
      </ul>

      <h2>8. Children</h2>
      <p>
        You must be at least 13 to have an account. People under 18 need a parent's or guardian's
        permission. We do not show ads to anyone or track anyone's behaviour. If you are a parent
        and want your child's account removed, write to us and we will delete it.
      </p>

      <h2>9. Security</h2>
      <p>
        Traffic is encrypted (HTTPS), passwords are hashed, two-step secrets are encrypted and
        sessions can be revoked. No system is perfectly secure; if something affecting you goes
        wrong we will tell you and the authorities as the law requires.
      </p>

      <h2>10. Changes</h2>
      <p>
        If we change this policy we update the version and date above and, for important changes,
        tell you in the app.
      </p>

      <h2>11. Contact</h2>
      <p>{{ c.email }}</p>
    }
  `,
})
export class LegalText {
  readonly kind = input.required<'terms' | 'privacy'>();
  protected readonly c = contact();
  protected readonly version = LEGAL_VERSION;
  protected readonly updated = LEGAL_UPDATED;
}
