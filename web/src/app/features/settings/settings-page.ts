import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AppUpdateSection } from './app-update-section';
import { DangerSection } from './danger-section';
import { IdentitiesSection } from './identities-section';
import { ProfileSection } from './profile-section';
import { SecuritySection } from './security-section';
import { TwoFactorSection } from './two-factor-section';

@Component({
  selector: 'app-settings-page',
  imports: [
    AppUpdateSection,
    ProfileSection,
    SecuritySection,
    TwoFactorSection,
    IdentitiesSection,
    DangerSection,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 16px;
      max-width: 720px;
      margin: 0 auto;
      width: 100%;
    }
    h1 {
      margin: 0;
    }
  `,
  template: `
    <h1>Account settings</h1>
    <app-update-section />
    <app-profile-section />
    <app-security-section />
    <app-two-factor-section />
    <app-identities-section [linked]="linked()" [linkError]="linkError()" />
    <app-danger-section />
  `,
})
export class SettingsPage {
  /** Bound from the query string after returning from a provider. */
  readonly linked = input<string>();
  readonly linkError = input<string>();
}
