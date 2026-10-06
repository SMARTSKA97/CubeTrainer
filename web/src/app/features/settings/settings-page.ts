import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DangerSection } from './danger-section';
import { ProfileSection } from './profile-section';
import { SecuritySection } from './security-section';

@Component({
  selector: 'app-settings-page',
  imports: [ProfileSection, SecuritySection, DangerSection],
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
    <app-profile-section />
    <app-security-section />
    <app-danger-section />
  `,
})
export class SettingsPage {}
