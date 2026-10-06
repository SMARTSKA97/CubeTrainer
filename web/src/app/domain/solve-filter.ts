import type { Solve } from './stats';

/** Which solves a stats view looks at. Every field is optional; an empty filter keeps everything. */
export interface SolveFilter {
  /** only solves made in the last N days (calendar-free: N x 24 h) */
  days?: number;
  cube?: string;
  method?: string;
}

export const PERIODS: { days: number | undefined; label: string }[] = [
  { days: undefined, label: 'All time' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

const DAY_MS = 86_400_000;
const same = (a: string | undefined, b: string | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

export function isActive(f: SolveFilter): boolean {
  return f.days !== undefined || !!f.cube || !!f.method;
}

/** Solves matching the filter, keeping their order. `now` is injectable for tests. */
export function filterSolves(
  solves: readonly Solve[],
  f: SolveFilter,
  now: number = Date.now(),
): Solve[] {
  if (!isActive(f)) return [...solves];
  const from = f.days === undefined ? -Infinity : now - f.days * DAY_MS;
  return solves.filter(
    (s) =>
      s.at >= from && (!f.cube || same(s.cube, f.cube)) && (!f.method || same(s.method, f.method)),
  );
}

/** The cubes and methods that actually occur in the data, most used first, for the filter drop-downs. */
export function facets(solves: readonly Solve[]): { cubes: string[]; methods: string[] } {
  const rank = (pick: (s: Solve) => string | undefined): string[] => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const s of solves) {
      const v = pick(s)?.trim();
      if (!v) continue;
      const key = v.toLowerCase();
      const cur = counts.get(key);
      if (cur) cur.n++;
      else counts.set(key, { label: v, n: 1 });
    }
    return [...counts.values()]
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
      .map((c) => c.label);
  };
  return { cubes: rank((s) => s.cube), methods: rank((s) => s.method) };
}
