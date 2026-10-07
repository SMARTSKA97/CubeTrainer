/** Streak, milestones and the weekly recap, worked out from plain numbers so they can be tested. */
import { dayIndex } from './plan';
import type { Solve } from './stats';

export interface BadgeInput {
  totalSolves: number;
  caseSolves: number;
  streak: number;
  longestStreak: number;
  finishedCases: number;
  practiceDays: number;
  bestSingleMs: number | null;
}

export interface Badge {
  id: string;
  title: string;
  text: string;
  earned: boolean;
  /** 0..1, how close the next goal is */
  progress: number;
}

function counter(id: string, title: string, text: string, have: number, goal: number): Badge {
  return { id, title, text, earned: have >= goal, progress: Math.min(1, have / goal) };
}

export function computeBadges(i: BadgeInput): Badge[] {
  const speed = (id: string, title: string, secs: number): Badge => {
    const t = secs * 1000;
    const earned = i.bestSingleMs !== null && i.bestSingleMs < t;
    return {
      id,
      title,
      text: `A single under ${secs} seconds`,
      earned,
      progress: earned ? 1 : i.bestSingleMs === null ? 0 : Math.min(1, t / i.bestSingleMs),
    };
  };
  return [
    counter('first', 'First solve', 'Record your first solve', i.totalSolves, 1),
    counter('s100', '100 solves', 'Keep going: 100 solves in total', i.totalSolves, 100),
    counter('s500', '500 solves', '500 solves in total', i.totalSolves, 500),
    counter('s1000', '1,000 solves', 'A thousand solves', i.totalSolves, 1000),
    counter('streak3', '3-day streak', 'Practise three days in a row', i.longestStreak, 3),
    counter('streak7', 'Week streak', 'Practise seven days in a row', i.longestStreak, 7),
    counter('streak30', 'Month streak', 'Practise thirty days in a row', i.longestStreak, 30),
    counter('c1', 'First case learned', 'Get one case to "finished"', i.finishedCases, 1),
    counter('c10', '10 cases learned', 'Ten cases marked finished', i.finishedCases, 10),
    counter('c50', '50 cases learned', 'Fifty cases marked finished', i.finishedCases, 50),
    counter('d10', '10 practice days', 'Practise on ten different days', i.practiceDays, 10),
    counter('d30', '30 practice days', 'Practise on thirty different days', i.practiceDays, 30),
    speed('sub60', 'Sub-60', 60),
    speed('sub30', 'Sub-30', 30),
    speed('sub20', 'Sub-20', 20),
    speed('sub10', 'Sub-10', 10),
  ];
}

/** Longest run of consecutive practice days anywhere in the history. */
export function longestStreak(solves: Pick<Solve, 'at'>[], tzOffsetMin = 0): number {
  const days = [...new Set(solves.map((s) => dayIndex(s.at, tzOffsetMin)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let k = 0; k < days.length; k++) {
    run = k > 0 && days[k] === days[k - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export interface Recap {
  solves: number;
  /** solves in the seven days before that, to say "more" or "fewer" */
  previous: number;
  days: number;
  bestMs: number | null;
  meanMs: number | null;
}

/** The last 7 days (including today) against the 7 before. DNFs count as solves but not as times. */
export function weeklyRecap(
  solves: Pick<Solve, 'at' | 'timeMs' | 'penalty'>[],
  now: number,
  tzOffsetMin = 0,
): Recap {
  const today = dayIndex(now, tzOffsetMin);
  const inWeek = solves.filter((s) => {
    const d = dayIndex(s.at, tzOffsetMin);
    return d > today - 7 && d <= today;
  });
  const before = solves.filter((s) => {
    const d = dayIndex(s.at, tzOffsetMin);
    return d > today - 14 && d <= today - 7;
  });
  const times = inWeek
    .filter((s) => s.penalty !== 'dnf')
    .map((s) => s.timeMs + (s.penalty === 'plus2' ? 2000 : 0));
  return {
    solves: inWeek.length,
    previous: before.length,
    days: new Set(inWeek.map((s) => dayIndex(s.at, tzOffsetMin))).size,
    bestMs: times.length ? Math.min(...times) : null,
    meanMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
  };
}
