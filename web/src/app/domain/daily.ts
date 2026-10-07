import { randomScramble } from './cube';
import { dayIndex } from './plan';
import type { Solve } from './stats';

/** A small seeded random generator, so everyone gets the same scramble on the same day. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The daily full-solve scramble for the day with this index (see `dayIndex`). */
export function dailyScramble(day: number): string {
  return randomScramble(20, seeded(day * 2654435761 + 1013904223));
}

export interface DailySolve {
  done: boolean;
  /** best counted time today on the daily scramble, in ms (null = none or only DNFs) */
  bestMs: number | null;
  attempts: number;
}

const eff = (s: Solve) =>
  s.penalty === 'dnf' ? null : s.timeMs + (s.penalty === 'plus2' ? 2000 : 0);

/** Has the daily scramble been solved today, and how fast? A DNF counts as an attempt, not as done. */
export function dailyStatus(solves: Solve[], now: number, tzOffsetMin = 0): DailySolve {
  const day = dayIndex(now, tzOffsetMin);
  const want = dailyScramble(day);
  let bestMs: number | null = null;
  let attempts = 0;
  for (const s of solves) {
    if (s.mode !== 'random' || s.scramble !== want || dayIndex(s.at, tzOffsetMin) !== day) continue;
    attempts++;
    const e = eff(s);
    if (e !== null && (bestMs === null || e < bestMs)) bestMs = e;
  }
  return { done: bestMs !== null, bestMs, attempts };
}
