import { Injectable, computed, inject } from '@angular/core';
import { usePref } from '@core/pref';
import { HapticsService } from '@core/haptics.service';
import {
  CasesStep,
  LEVELS,
  LEVEL_IDS,
  LevelCheck,
  LevelId,
  StepProgress,
  activeBatch,
  currentStep,
  isFullSolve,
  levelCheck,
  stepProgress,
} from '@domain/levels';
import {
  CaseMemory,
  applyRecall,
  dueRecalls,
  introduce,
  introducedToday,
  isRecalled,
} from '@domain/memory';
import { AlgService } from './alg-service';
import { SolveStore } from './solve-store';

export interface NextStep {
  kind: 'placement' | 'recall' | 'learn' | 'solves' | 'done';
  title: string;
  detail: string;
  link: string;
  cta: string;
}

export interface Placement {
  at: number;
  /** the solve time that placed the person; null when they could not solve it */
  timeMs: number | null;
  level: LevelId;
}

/**
 * The learning path: which level the person is on, what they have memorised and when each algorithm
 * is due to be recalled again, and what to do next. Everything is kept on this device.
 */
@Injectable({ providedIn: 'root' })
export class LearnService {
  private readonly algs = inject(AlgService);
  private readonly store = inject(SolveStore);
  private readonly haptics = inject(HapticsService);

  readonly level = usePref<LevelId | null>('learn.level', null);
  /** when the person last changed level; solve goals and the level check count from here */
  readonly since = usePref('learn.since', 0);
  readonly placement = usePref<Placement | null>('learn.placement', null);
  readonly memory = usePref<Record<string, CaseMemory>>('learn.memory', {});
  readonly stepsDone = usePref<string[]>('learn.done', []);
  /** new algorithms taken in per day: memory sticks better when it is spread out */
  readonly perDay = usePref('learn.perDay', 6);
  private readonly dismissed = usePref('learn.dismissed', '');

  caseIds = (step: CasesStep): string[] =>
    this.algs
      .casesOf(step.setId)
      .map((c) => c.id)
      .filter((id) => !step.ids || step.ids.includes(id));

  /** progress of every step of every level */
  readonly rows = computed<Record<LevelId, StepProgress[]>>(() => {
    const input = {
      caseIds: this.caseIds,
      memory: this.memory(),
      status: this.store.status(),
      stepsDone: this.stepsDone(),
      solves: this.store.solves(),
      sinceMs: this.since(),
    };
    return Object.fromEntries(
      LEVEL_IDS.map((id) => [id, LEVELS[id].steps.map((s) => stepProgress(s, input))]),
    ) as Record<LevelId, StepProgress[]>;
  });

  readonly current = computed(() => {
    const l = this.level();
    return l ? currentStep(this.rows()[l]) : null;
  });

  /** algorithms whose memory check is due */
  readonly due = computed(() => dueRecalls(this.memory(), Date.now()));
  readonly newToday = computed(() =>
    introducedToday(this.memory(), Date.now(), new Date().getTimezoneOffset()),
  );
  readonly newLeft = computed(() => Math.max(0, this.perDay() - this.newToday()));

  /** how many algorithms are remembered well enough to count (recalled at least once) */
  readonly recalledCount = computed(
    () => Object.values(this.memory()).filter((m) => isRecalled(m)).length,
  );

  readonly check = computed<LevelCheck | null>(() => {
    const l = this.level();
    return l ? levelCheck(l, this.store.solves(), this.since()) : null;
  });
  private readonly checkKey = computed(() => {
    const full = this.store.solves().filter(isFullSolve);
    return `${this.level()}:${full[full.length - 1]?.id ?? ''}`;
  });
  /** a promote/demote suggestion the person has not yet answered */
  readonly suggestion = computed(() => {
    const c = this.check();
    return c && c.action !== 'stay' && this.dismissed() !== this.checkKey() ? c : null;
  });
  dismissSuggestion(): void {
    this.dismissed.set(this.checkKey());
  }

  /** What to do right now: a memory check first (that is what stops forgetting), then new material. */
  readonly next = computed<NextStep>(() => {
    const l = this.level();
    if (!l)
      return {
        kind: 'placement',
        title: 'Find your level',
        detail:
          'Solve one scrambled cube against the clock and the app sets the path that fits you.',
        link: '/learn/placement',
        cta: 'Start the level check',
      };
    const due = this.due().length;
    if (due)
      return {
        kind: 'recall',
        title: `Memory check: ${due} algorithm${due === 1 ? '' : 's'}`,
        detail: 'Type each one from memory. It takes about two minutes and keeps them from fading.',
        link: '/learn/review',
        cta: 'Start the memory check',
      };
    const cur = this.current();
    if (cur) {
      if (cur.step.kind === 'solves')
        return {
          kind: 'solves',
          title: cur.step.title,
          detail: `${cur.count} of ${cur.step.need} done. Use the timer with a fresh scramble.`,
          link: '/timer',
          cta: 'Open the timer',
        };
      const blocked =
        cur.step.kind === 'cases' &&
        this.newLeft() === 0 &&
        activeBatch(this.caseIds(cur.step), this.memory()).every((id) => !this.memory()[id]);
      return {
        kind: 'learn',
        title: cur.step.title,
        detail: blocked
          ? 'That is enough new material for today. Sleep helps it stick: come back tomorrow.'
          : cur.step.short,
        link: blocked ? '/learn' : `/learn/step/${cur.step.id}`,
        cta: blocked ? 'See your path' : 'Continue',
      };
    }
    return {
      kind: 'done',
      title: `${LEVELS[l].name} complete`,
      detail: 'Every step is done. Keep your memory checks going and take a level check solve.',
      link: '/learn/placement',
      cta: 'Take a level check',
    };
  });

  // ---- actions --------------------------------------------------------------------------------

  setLevel(level: LevelId): void {
    this.level.set(level);
    this.since.set(Date.now());
  }

  finishPlacement(timeMs: number | null, level: LevelId): void {
    this.placement.set({ at: Date.now(), timeMs, level });
    this.setLevel(level);
  }

  /** the algorithm was shown in a lesson */
  see(id: string): void {
    if (this.memory()[id]) return;
    this.memory.update((m) => ({ ...m, [id]: introduce(Date.now()) }));
  }

  recall(id: string, ok: boolean): void {
    this.memory.update((m) => ({ ...m, [id]: applyRecall(m[id], ok, Date.now()) }));
    if (ok) this.haptics.tap();
    else this.haptics.error();
  }

  markStep(id: string, done: boolean): void {
    this.stepsDone.update((l) => (done ? [...new Set([...l, id])] : l.filter((x) => x !== id)));
    if (done) this.haptics.success();
  }
}
