import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

/**
 * Content that opens over the page on phones and tablets (a bottom sheet you close with a tap), and
 * simply sits in the page on a laptop or desktop where there is room. Keeps long things such as the
 * move animation from pushing the timer off the screen.
 */
@Component({
  selector: 'app-sheet',
  standalone: true,
  template: `
    @if (open()) {
      <button class="scrim" type="button" aria-label="Close" (click)="closed.emit()"></button>
      <div class="sheet" role="dialog" aria-modal="true" [attr.aria-label]="heading()">
        <div class="grab" aria-hidden="true"></div>
        <header>
          <h2>{{ heading() }}</h2>
          <button class="btn small" type="button" (click)="closed.emit()">Close</button>
        </header>
        <ng-content />
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: contents;
    }
    .scrim {
      border: 0;
      padding: 0;
      position: fixed;
      inset: 0;
      z-index: 60;
      background: rgba(4, 6, 10, 0.66);
      -webkit-backdrop-filter: blur(3px);
      backdrop-filter: blur(3px);
    }
    .sheet {
      position: fixed;
      z-index: 61;
      left: 0;
      right: 0;
      bottom: 0;
      max-width: 560px;
      margin: 0 auto;
      max-height: 94dvh;
      overflow-y: auto;
      display: grid;
      gap: 16px;
      padding: 10px 20px calc(24px + var(--sab));
      background: var(--panel);
      border: 1px solid var(--line);
      border-bottom: 0;
      border-radius: 26px 26px 0 0;
      box-shadow: 0 -24px 60px -20px rgba(0, 0, 0, 0.8);
    }
    .grab {
      width: 44px;
      height: 4px;
      border-radius: 4px;
      background: var(--line);
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    h2 {
      margin: 0;
      font-size: 17px;
    }
    /* Room to spare: no overlay, the content just sits in the page. */
    @media (min-width: 1000px) {
      .scrim,
      .grab {
        display: none;
      }
      .sheet {
        position: static;
        max-width: none;
        max-height: none;
        margin: 0;
        padding: 18px 20px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: none;
      }
    }
  `,
})
export class Sheet {
  readonly open = input.required<boolean>();
  readonly heading = input('');
  readonly closed = output<void>();
}
