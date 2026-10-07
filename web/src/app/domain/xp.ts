import { dailyScramble } from './daily';
import { dayIndex } from './plan';
import type { Solve } from './stats';

/**
 * Experience points, worked out from the solve history alone (nothing extra to store or sync).
 *   every solve          10  (a DNF still counts for 3: you tried)
 *   a full solve          +5
 *   the daily scramble   +40  (once a day, the first counted solve)
 *   each practice day    +10 per day of the streak that day, up to 10 days
 */
export const XP = { solve: 10, dnf: 3, full: 5, daily: 40, streakStep: 10, streakCap: 10 } as const;

/** Total XP needed to reach `level` (level 0 = 0 XP): 100, 300, 600, 1000, 1500 ... */
export const xpForLevel = (level: number) => (100 * level * (level + 1)) / 2;

const TITLES = [
  'Scrambler',
  'Beginner',
  'Cross builder',
  'Pair finder',
  'F2L learner',
  'Last-layer learner',
  'Sub-minute',
  'Speed cuber',
  'Algorithm ace',
  'Sub-20',
  'Cube master',
];

export interface XpSummary {
  xp: number;
  level: number;
  title: string;
  /** XP earned inside this level and the XP the level takes in all */
  into: number;
  span: number;
  /** XP earned on the most recent practice day */
  today: number;
}

export function xpSummary(solves: Solve[], now: number, tzOffsetMin = 0): XpSummary {
  const perDay = new Map<number, number>();
  const dailyDone = new Set<number>();
  for (const s of solves) {
    const d = dayIndex(s.at, tzOffsetMin);
    let gain = s.penalty === 'dnf' ? XP.dnf : XP.solve;
    if (s.mode === 'random' && (s.stage ?? 'full') === 'full') gain += XP.full;
    if (
      s.mode === 'random' &&
      s.penalty !== 'dnf' &&
      !dailyDone.has(d) &&
      s.scramble === dailyScramble(d)
    ) {
      dailyDone.add(d);
      gain += XP.daily;
    }
    perDay.set(d, (perDay.get(d) ?? 0) + gain);
  }
  const days = [...perDay.keys()].sort((a, b) => a - b);
  let run = 0;
  let xp = 0;
  days.forEach((d, i) => {
    run = i > 0 && d === days[i - 1] + 1 ? run + 1 : 1;
    xp += perDay.get(d)! + XP.streakStep * Math.min(run, XP.streakCap);
  });
  let level = 0;
  while (xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  const today = perDay.get(dayIndex(now, tzOffsetMin)) ?? 0;
  return {
    xp,
    level,
    title: TITLES[Math.min(level, TITLES.length - 1)],
    into: xp - base,
    span: xpForLevel(level + 1) - base,
    today,
  };
}
