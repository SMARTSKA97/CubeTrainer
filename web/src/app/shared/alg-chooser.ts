import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { AlgCase } from '@core/data/alg-service';
import { AlgChoice } from '@core/data/alg-choice';

/** Pick the algorithm you use for a case (standard, an alternative, or your own, checked for you). */
@Component({
  selector: 'app-alg-chooser',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="tabs" role="group" aria-label="Algorithm">
        @for (o of options(); track o.alg) {
          <button
            type="button"
            class="tab"
            [class.on]="o.alg === current()"
            (click)="choice.choose(c(), o.alg)"
          >
            {{ o.label }}
          </button>
        }
        <button type="button" class="tab add" (click)="open.set(!open())">
          {{ hasMine() ? 'Edit mine' : '+ My own' }}
        </button>
      </div>
      <code class="alg">{{ current() }}</code>
      @if (note(); as n) {
        <span class="muted small">{{ n }}</span>
      }
      @if (open()) {
        <form class="mine" (submit)="$event.preventDefault(); save(input.value)">
          <label class="field"
            >Your algorithm for this case
            <input
              #input
              type="text"
              autocapitalize="off"
              autocomplete="off"
              spellcheck="false"
              placeholder="e.g. R U R' U R U2 R'"
              [value]="mineText()"
            />
          </label>
          <div class="row">
            <button class="btn small primary" type="submit">Check and save</button>
            @if (hasMine()) {
              <button class="btn small" type="button" (click)="remove()">Remove mine</button>
            }
          </div>
          @if (error(); as e) {
            <p class="err">{{ e }}</p>
          }
          @if (saved()) {
            <p class="ok">Saved. It solves this case, and it is now the one shown.</p>
          }
        </form>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .wrap {
      display: grid;
      gap: 10px;
    }
    .tabs {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tab {
      border: 1px solid var(--line);
      background: var(--bg);
      color: var(--muted);
      font: inherit;
      font-size: 13.5px;
      font-weight: 600;
      padding: 7px 14px;
      border-radius: 999px;
      cursor: pointer;
    }
    .tab.on {
      color: var(--text);
      background: var(--accent-soft);
      border-color: rgba(124, 156, 255, 0.45);
    }
    .tab.add {
      border-style: dashed;
    }
    .alg {
      display: block;
      padding: 10px 12px;
      background: var(--bg);
      border: 1px solid var(--line-soft);
      border-radius: 12px;
      font-size: 15px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }
    .small {
      font-size: 12.5px;
    }
    .mine {
      display: grid;
      gap: 10px;
    }
  `,
})
export class AlgChooser {
  readonly choice = inject(AlgChoice);
  readonly c = input.required<AlgCase>();

  readonly options = computed(() => this.choice.options(this.c()));
  readonly current = computed(() => this.choice.chosen(this.c()));
  readonly note = computed(() => this.options().find((o) => o.alg === this.current())?.note ?? '');
  readonly hasMine = computed(() => this.options().some((o) => o.kind === 'mine'));
  readonly mineText = computed(() => this.options().find((o) => o.kind === 'mine')?.alg ?? '');

  readonly open = signal(false);
  readonly error = signal('');
  readonly saved = signal(false);

  save(text: string) {
    this.saved.set(false);
    const r = this.choice.saveMine(this.c(), text);
    this.error.set(r.ok ? '' : (r.error ?? 'Could not save that.'));
    this.saved.set(r.ok);
  }

  remove() {
    this.choice.removeMine(this.c());
    this.error.set('');
    this.saved.set(false);
    this.open.set(false);
  }
}
