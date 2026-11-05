import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const SLICES = ['M', 'E', 'S'];
const ROTATIONS = ['x', 'y', 'z'];

/**
 * A keypad for typing an algorithm on a phone: tap a face, then tap ′ or 2 to change the move you
 * just added. The value is the plain text of the algorithm ("R U R' U'"). Also accepts a keyboard.
 */
@Component({
  selector: 'app-move-pad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 10px;
    }
    .screen {
      min-height: 56px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-content: flex-start;
      padding: 10px;
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .screen .empty {
      color: var(--muted);
      font-family: inherit;
      font-size: 14px;
    }
    .mv {
      padding: 4px 9px;
      border-radius: 8px;
      background: var(--panel-2);
      font-size: 17px;
      font-weight: 600;
    }
    .mv.last {
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1px var(--accent);
    }
    .keys {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
    }
    .keys.small {
      grid-template-columns: repeat(7, 1fr);
    }
    button {
      min-height: 46px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      font: inherit;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
    }
    button:active {
      background: var(--accent-soft);
    }
    button.alt {
      font-size: 15px;
      color: var(--muted);
    }
    button:disabled {
      opacity: 0.4;
    }
    .more {
      font-size: 13px;
      color: var(--muted);
    }
    summary {
      cursor: pointer;
      padding: 4px 0;
    }
  `,
  template: `
    <div class="screen" aria-live="polite" [attr.aria-label]="'Moves so far: ' + value()">
      @for (m of moves(); track $index; let last = $last) {
        <span class="mv" [class.last]="last">{{ m }}</span>
      } @empty {
        <span class="empty">Tap the moves of the algorithm</span>
      }
    </div>
    <div class="keys" role="group" aria-label="Faces">
      @for (f of faces; track f) {
        <button type="button" (click)="add(f)">{{ f }}</button>
      }
    </div>
    <div class="keys" role="group" aria-label="Change the last move">
      <button type="button" class="alt" (click)="prime()" [disabled]="!moves().length">
        &prime;
      </button>
      <button type="button" class="alt" (click)="twice()" [disabled]="!moves().length">2</button>
      <button type="button" class="alt" (click)="add('r')">r</button>
      <button type="button" class="alt" (click)="add('l')">l</button>
      <button type="button" class="alt" (click)="add('f')">f</button>
      <button
        type="button"
        class="alt"
        (click)="back()"
        [disabled]="!moves().length"
        aria-label="Delete last move"
      >
        &#9003;
      </button>
    </div>
    <details class="more">
      <summary>Rotations and slices</summary>
      <div class="keys small">
        @for (r of rotations; track r) {
          <button type="button" class="alt" (click)="add(r)">{{ r }}</button>
        }
        @for (s of slices; track s) {
          <button type="button" class="alt" (click)="add(s)">{{ s }}</button>
        }
        <button type="button" class="alt" (click)="clear()" [disabled]="!moves().length">
          Clear
        </button>
      </div>
    </details>
  `,
})
export class MovePad {
  readonly value = model('');
  readonly faces = FACES;
  readonly slices = SLICES;
  readonly rotations = ROTATIONS;
  readonly disabled = input(false);
  readonly moves = computed(() => this.value().split(/\s+/).filter(Boolean));

  private set(list: string[]) {
    this.value.set(list.join(' '));
  }
  add(m: string) {
    if (this.disabled()) return;
    this.set([...this.moves(), m]);
  }
  /** turn the last move into its anticlockwise form, or back */
  prime() {
    this.change((b) => (b.endsWith("'") ? b.slice(0, -1) : b.replace(/2$/, '') + "'"));
  }
  twice() {
    this.change((b) => (b.endsWith('2') ? b.slice(0, -1) : b.replace(/'$/, '') + '2'));
  }
  private change(f: (m: string) => string) {
    const l = this.moves();
    if (!l.length) return;
    this.set([...l.slice(0, -1), f(l[l.length - 1])]);
  }
  back() {
    this.set(this.moves().slice(0, -1));
  }
  clear() {
    this.value.set('');
  }
}
