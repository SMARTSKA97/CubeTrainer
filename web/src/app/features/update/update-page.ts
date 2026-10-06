import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppUpdateSection } from '../settings/app-update-section';

/** Reachable without an account (guests use the app too). */
@Component({
  selector: 'app-update-page',
  imports: [AppUpdateSection],
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
    <h1>App updates</h1>
    <app-update-section />
  `,
})
export class UpdatePage {}
