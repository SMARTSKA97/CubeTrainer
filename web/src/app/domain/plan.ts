import type { CaseStatus, Solve } from './stats';

/**
 * Daily practice plan with spaced repetition.
 *
 * Each case has a "box" (0-5): every day you practised it and averaged at or under the target, the
 * box goes up by one; a slow day sends it back two boxes. The box decides how long the case may rest:
 * 0 -> 0 days (practise again today), 1 -> 1, 2 -> 3, 3 -> 7, 4 -> 14, 5 -> 30 days.
 * The plan for a day is built from the state at the START of that day (solves before today), so it
 * stays stable while you work through it, and today's solves only tick items off.
 */
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
export const REPS = { due: 2, learning: 5, new: 5 } as const;

export type PlanReason = 'due' | 'learning' | 'new';

export interface PlanItem {
  caseId: string;
  setId: string;
  reason: PlanReason;
  /** attempts wanted today */
  reps: number;
  /** attempts already done today */
  done: number;
  box: number;
  /** days the case has been resting beyond its interval (due items) */
  overdueDays: number;
}

export interface PlanInput {
  cases: { id: string; set: string }[];
  solvesByCase: Map<string, Solve[]>;
  statuses: Record<string, CaseStatus>;
  targetMs: (setId: string) => number;
  activeSets: string[];
  now: number;
  /** Date#getTimezoneOffset(): minutes to subtract from UTC for local time */
  tzOffsetMin?: number;
  maxItems?: number;
  maxNew?: number;
}

const DAY = 86400000;
const eff = (s: Solve) =>
  s.penalty === 'dnf' ? null : s.timeMs + (s.penalty === 'plus2' ? 2000 : 0);

export function dayIndex(ms: number, tzOffsetMin = 0): number {
  return Math.floor((ms - tzOffsetMin * 60000) / DAY);
}

/** Leitner-style box from the day-by-day history of one case (solves oldest -> newest). */
export function boxOf(solves: Solve[], targetMs: number, tzOffsetMin = 0): number {
  const days = new Map<number, number[]>();
  for (const s of solves) {
    const d = dayIndex(s.at, tzOffsetMin);
    const list = days.get(d) ?? [];
    const e = eff(s);
    if (e !== null) list.push(e);
    days.set(d, list);
  }
  let box = 0;
  for (const d of [...days.keys()].sort((a, b) => a - b)) {
    const times = days.get(d)!;
    const mean = times.length ? times.reduce((a, b) => a + b, 0) / times.length : Infinity;
    box = mean <= targetMs ? Math.min(5, box + 1) : Math.max(0, box - 2);
  }
  return box;
}

export function buildPlan(inp: PlanInput): PlanItem[] {
  const tz = inp.tzOffsetMin ?? 0;
  const today = dayIndex(inp.now, tz);
  const maxItems = inp.maxItems ?? 12;
  const maxNew = inp.maxNew ?? 3;
  const active = new Set(inp.activeSets);

  const due: PlanItem[] = [];
  const learning: PlanItem[] = [];
  const fresh: PlanItem[] = [];

  for (const c of inp.cases) {
    if (!active.has(c.set)) continue;
    const all = inp.solvesByCase.get(c.id) ?? [];
    const before = all.filter((s) => dayIndex(s.at, tz) < today);
    const done = all.length - before.length;
    const status = inp.statuses[c.id] ?? 'unlearned';
    const target = inp.targetMs(c.set);

    if (all.length === 0) {
      fresh.push({
        caseId: c.id,
        setId: c.set,
        reason: 'new',
        reps: REPS.new,
        done: 0,
        box: 0,
        overdueDays: 0,
      });
      continue;
    }
    const box = boxOf(before, target, tz);
    const last = before[before.length - 1];
    if (!last) {
      // first practised today: keep it in the plan so it can be finished
      learning.push({
        caseId: c.id,
        setId: c.set,
        reason: 'learning',
        reps: REPS.learning,
        done,
        box: 0,
        overdueDays: 0,
      });
      continue;
    }
    const rest = today - dayIndex(last.at, tz);
    const interval = INTERVAL_DAYS[box];
    if (status === 'finished') {
      if (rest >= interval)
        due.push({
          caseId: c.id,
          setId: c.set,
          reason: 'due',
          reps: REPS.due,
          done,
          box,
          overdueDays: rest - interval,
        });
      else if (done > 0)
        due.push({
          caseId: c.id,
          setId: c.set,
          reason: 'due',
          reps: REPS.due,
          done,
          box,
          overdueDays: 0,
        });
    } else if (rest >= Math.max(1, interval) || done > 0) {
      learning.push({
        caseId: c.id,
        setId: c.set,
        reason: 'learning',
        reps: REPS.learning,
        done,
        box,
        overdueDays: Math.max(0, rest - interval),
      });
    }
  }

  due.sort((a, b) => b.overdueDays - a.overdueDays || a.box - b.box);
  learning.sort((a, b) => a.box - b.box || b.overdueDays - a.overdueDays);

  const plan = [...due, ...learning].slice(0, maxItems);
  // introduce new cases only when the learning pile is small, so the plan never snowballs
  const backlog = learning.length;
  const room = Math.min(maxNew, Math.max(0, maxItems - plan.length), backlog >= 8 ? 0 : maxNew);
  plan.push(...fresh.slice(0, room));
  return plan;
}

export function planProgress(plan: PlanItem[]) {
  const total = plan.reduce((n, p) => n + p.reps, 0);
  const done = plan.reduce((n, p) => n + Math.min(p.done, p.reps), 0);
  return {
    total,
    done,
    items: plan.length,
    itemsDone: plan.filter((p) => p.done >= p.reps).length,
  };
}

/** Consecutive practice days up to today (or yesterday, so the streak survives until you practise). */
export function streakDays(solves: Pick<Solve, 'at'>[], now: number, tzOffsetMin = 0): number {
  const days = new Set(solves.map((s) => dayIndex(s.at, tzOffsetMin)));
  const today = dayIndex(now, tzOffsetMin);
  let cursor = days.has(today) ? today : today - 1;
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor--;
  }
  return n;
}
