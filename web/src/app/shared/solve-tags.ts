import { Component, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { SolveStore } from '@core/data/solve-store';
import { MISTAKES, Solve } from '@domain/stats';

/** Toggle chips for "what went wrong" on a finished solve. */
@Component({
  selector: 'app-solve-tags',
  standalone: true,
  template: `
    <div class="tags">
      <span class="label">What went wrong?</span>
      @for (m of mistakes; track m.id) {
        <button class="chip" [class.on]="active().has(m.id)" (click)="toggle(m.id)">
          {{ m.label }}
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin-top: 10px;
    }
    .chip {
      background: var(--bg);
      color: var(--muted);
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    .chip.on {
      background: #3b2a0a;
      color: #f59e0b;
      border-color: #f59e0b;
    }
  `,
})
export class SolveTags {
  private readonly store = inject(SolveStore);
  readonly solve = input.required<Solve>();
  readonly mistakes = MISTAKES;
  readonly active = computed(
    () =>
      new Set(
        this.store.solves().find((s) => s.id === this.solve().id)?.tags ?? this.solve().tags ?? [],
      ),
  );

  toggle(id: string) {
    const cur = new Set(this.active());
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    void this.store.setTags(this.solve().id, [...cur]);
  }
}
