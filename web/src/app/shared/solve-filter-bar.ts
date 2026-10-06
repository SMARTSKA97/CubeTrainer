import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SolveFilterState } from '@core/data/solve-filter-state';
import { PERIODS } from '@domain/solve-filter';

/** Period, cube and method drop-downs that narrow what History and Progress count. */
@Component({
  selector: 'app-solve-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" role="group" aria-label="Filter solves">
      <label>
        Period
        <select (change)="period($any($event.target).value)">
          @for (p of periods; track p.label) {
            <option [value]="p.days ?? ''" [selected]="state.filter().days === p.days">
              {{ p.label }}
            </option>
          }
        </select>
      </label>
      @if (state.options().cubes.length) {
        <label>
          Cube
          <select (change)="state.set({ cube: $any($event.target).value })">
            <option value="">All cubes</option>
            @for (c of state.options().cubes; track c) {
              <option [value]="c" [selected]="state.filter().cube === c">{{ c }}</option>
            }
          </select>
        </label>
      }
      @if (state.options().methods.length) {
        <label>
          Method
          <select (change)="state.set({ method: $any($event.target).value })">
            <option value="">All methods</option>
            @for (m of state.options().methods; track m) {
              <option [value]="m" [selected]="state.filter().method === m">{{ m }}</option>
            }
          </select>
        </label>
      }
      @if (state.active()) {
        <button class="btn small" type="button" (click)="state.clear()">Clear filter</button>
      }
    </div>
    @if (state.active()) {
      <p class="muted note" role="status">
        Showing {{ state.solves().length }} matching solve{{
          state.solves().length === 1 ? '' : 's'
        }}. Solves made before cube and method were recorded only appear under "All".
      </p>
    }
  `,
  styles: `
    .bar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      align-items: end;
    }
    label {
      display: grid;
      gap: 4px;
      font-size: 12px;
      color: var(--muted);
    }
    .note {
      margin: 8px 0 0;
      font-size: 13px;
    }
  `,
})
export class SolveFilterBar {
  protected readonly state = inject(SolveFilterState);
  protected readonly periods = PERIODS;

  protected period(value: string): void {
    this.state.set({ days: value === '' ? undefined : Number(value) });
  }
}
