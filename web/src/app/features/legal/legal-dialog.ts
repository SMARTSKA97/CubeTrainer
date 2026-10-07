import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LegalText } from './legal-text';

/**
 * The Terms / Privacy text in a modal on top of the sign-up form, so people can read it without losing what they typed
 * (also works inside the Android app). "I agree" ticks the form's checkbox.
 */
@Component({
  selector: 'app-legal-dialog',
  imports: [LegalText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    dialog {
      width: min(680px, 94vw);
      max-height: 88vh;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel);
      color: var(--text);
    }
    dialog::backdrop {
      background: rgba(0, 0, 0, 0.6);
    }
    .body {
      padding: 18px 22px;
      overflow: auto;
      max-height: calc(88vh - 76px);
    }
    footer {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      padding: 12px 18px;
      border-top: 1px solid var(--line);
      position: sticky;
      bottom: 0;
      background: var(--panel);
    }
  `,
  template: `
    <dialog #dlg (close)="kind.set(null)">
      @if (kind(); as k) {
        <div class="body"><app-legal-text [kind]="k" /></div>
        <footer>
          <button class="btn" type="button" (click)="dlg.close()">Close</button>
          <button class="btn primary" type="button" (click)="agree(dlg)">I agree</button>
        </footer>
      }
    </dialog>
  `,
})
export class LegalDialog {
  readonly agreed = output<void>();
  protected readonly kind = signal<'terms' | 'privacy' | null>(null);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  open(kind: 'terms' | 'privacy'): void {
    this.kind.set(kind);
    this.dlg().nativeElement.showModal();
  }

  protected agree(dlg: HTMLDialogElement): void {
    this.agreed.emit();
    dlg.close();
  }
}
