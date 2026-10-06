import { Injectable, computed, inject, signal } from '@angular/core';
import { SolveFilter, facets, filterSolves, isActive } from '@domain/solve-filter';
import { SolveStore } from './solve-store';

/** The current stats filter, shared by History and Progress so it follows you between pages (kept in memory only). */
@Injectable({ providedIn: 'root' })
export class SolveFilterState {
  private readonly store = inject(SolveStore);
  readonly filter = signal<SolveFilter>({});
  readonly active = computed(() => isActive(this.filter()));
  readonly options = computed(() => facets(this.store.solves()));
  /** All solves, oldest first, that match the filter. */
  readonly solves = computed(() => filterSolves(this.store.solves(), this.filter()));

  set(patch: Partial<SolveFilter>): void {
    this.filter.update((f) => {
      const next = { ...f, ...patch };
      if (next.days === undefined) delete next.days;
      if (!next.cube) delete next.cube;
      if (!next.method) delete next.method;
      return next;
    });
  }

  clear(): void {
    this.filter.set({});
  }
}
