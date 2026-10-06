import { Injectable, computed, inject } from '@angular/core';
import { AlgService } from './alg-service';
import { LearningSettings } from './learning-settings';
import { buildPlan, planProgress, streakDays } from '@domain/plan';
import { usePref } from '@core/pref';
import { SolveStore } from './solve-store';
import { Solve } from '@domain/stats';

/** Today's practice plan (spaced repetition), daily goal and streak, shared by the Today page and the Trainer. */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly algs = inject(AlgService);
  private readonly store = inject(SolveStore);
  private readonly learning = inject(LearningSettings);

  /** sets that take part in the plan */
  readonly activeSets = usePref<string[]>('plan.sets', ['2lookoll', '2lookpll']);
  /** solves per day the user wants to do */
  readonly goal = usePref('plan.goal', 30);
  readonly maxItems = usePref('plan.maxItems', 12);

  private readonly caseSolves = computed(() => {
    const m = new Map<string, Solve[]>();
    for (const s of this.store.solves()) {
      if (s.mode !== 'case' || !s.caseId) continue;
      const l = m.get(s.caseId) ?? [];
      l.push(s);
      m.set(s.caseId, l);
    }
    return m;
  });

  readonly plan = computed(() =>
    buildPlan({
      cases: this.algs.cases(),
      solvesByCase: this.caseSolves(),
      statuses: this.store.status(),
      targetMs: (setId) => this.learning.targetMs(setId),
      activeSets: this.activeSets(),
      now: Date.now(),
      tzOffsetMin: new Date().getTimezoneOffset(),
      maxItems: this.maxItems(),
    }),
  );
  readonly progress = computed(() => planProgress(this.plan()));
  readonly streak = computed(() =>
    streakDays(this.store.solves(), Date.now(), new Date().getTimezoneOffset()),
  );
  readonly solvesToday = computed(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.store.solves().filter((s) => s.at >= start.getTime()).length;
  });
}
