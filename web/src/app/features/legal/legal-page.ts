import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LegalText } from './legal-text';

@Component({
  selector: 'app-legal-page',
  imports: [LegalText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      max-width: 720px;
      margin: 0 auto;
    }
    .card {
      padding: 24px;
    }
  `,
  template: ` <section class="card"><app-legal-text [kind]="kind" /></section> `,
})
export class LegalPage {
  protected readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as 'terms' | 'privacy';
}
