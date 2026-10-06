import type { CaseStatus, Solve } from './stats';

/**
 * Automatic "unlearned -> learning -> finished" status from timings.
 *
 *  - no solves                       -> unlearned
 *  - at least one solve              -> learning
 *  - finished when ALL hold, looking at the newest `window` (5) solves of the case:
 *      * there are at least `window` solves and none of them is a DNF
 *      * their mean is at or under the target time of the set
 *      * the slowest of them is at most `slowFactor` x target (consistency, not one lucky solve)
 *      * they come from at least `minDays` different calendar days (a case you only nailed in one
 *        sitting is still in short-term memory) - can be switched off
 *  - a finished case drops back to learning (hysteresis, so it does not flicker) when the newest 3
 *    solves average more than `demoteFactor` x target, or one of the newest 2 is a DNF.
 */
export interface LearningRules {
  window: number;
  slowFactor: number;
  demoteFactor: number;
  minDays: number;
}

export const DEFAULT_RULES: LearningRules = {
  window: 5,
  slowFactor: 1.6,
  demoteFactor: 1.6,
  minDays: 2,
};

/** Target mean per set, in seconds, for "finished". Editable in the app. */
export const DEFAULT_TARGETS: Record<string, number> = {
  '2lookoll': 6,
  '2lookpll': 6,
  oll: 5,
  pll: 4.5,
  coll: 5.5,
  wv: 6,
  oholl: 7,
  ohpll: 6,
  'f2l-basic': 6,
  'f2l-adv': 8,
  'f2l-expert': 10,
  'f2l-chain': 25,
  beginner: 15,
  ollpll: 10,
};
export const FALLBACK_TARGET = 8;

export function targetSeconds(setId: string, custom: Record<string, number> = {}): number {
  return custom[setId] ?? DEFAULT_TARGETS[setId] ?? FALLBACK_TARGET;
}

const eff = (s: Pick<Solve, 'timeMs' | 'penalty'>): number | null =>
  s.penalty === 'dnf' ? null : s.timeMs + (s.penalty === 'plus2' ? 2000 : 0);

const dayKey = (ms: number, offsetMin: number) => Math.floor((ms - offsetMin * 60000) / 86400000);

export interface LearningInfo {
  status: CaseStatus;
  attempts: number;
  /** mean of the newest `window` solves, ms (null until there are enough, or with a DNF) */
  recentMean: number | null;
  /** short explanation of what is still missing, or why it is finished */
  reason: string;
}

/**
 * @param solves   solves of ONE case, oldest -> newest
 * @param targetMs target mean in ms
 * @param current  the status the case has now (needed for the demotion hysteresis)
 * @param tzOffsetMin minutes to subtract from UTC to get local days (Date#getTimezoneOffset())
 */
export function evaluateCase(
  solves: Solve[],
  targetMs: number,
  current: CaseStatus = 'unlearned',
  rules: LearningRules = DEFAULT_RULES,
  tzOffsetMin = 0,
): LearningInfo {
  const n = solves.length;
  if (n === 0)
    return {
      status: current === 'unlearned' ? 'unlearned' : current,
      attempts: 0,
      recentMean: null,
      reason: 'No attempts yet.',
    };

  const recent = solves.slice(-rules.window);
  const times = recent.map(eff);
  const hasDnf = times.some((t) => t === null);
  const valid = times.filter((t): t is number => t !== null);
  const recentMean =
    recent.length === rules.window && !hasDnf
      ? valid.reduce((a, b) => a + b, 0) / valid.length
      : null;
  const slowest = valid.length ? Math.max(...valid) : Infinity;
  const days = new Set(recent.map((s) => dayKey(s.at, tzOffsetMin))).size;
  const targetS = (targetMs / 1000).toFixed(1);

  const qualifies =
    recentMean !== null &&
    recentMean <= targetMs &&
    slowest <= targetMs * rules.slowFactor &&
    (rules.minDays <= 1 || days >= rules.minDays);

  if (qualifies) {
    if (current === 'finished' && demote(solves, targetMs, rules)) {
      return {
        status: 'learning',
        attempts: n,
        recentMean,
        reason: 'Recent solves got slow again.',
      };
    }
    return {
      status: 'finished',
      attempts: n,
      recentMean,
      reason: `Last ${rules.window} averaged ${(recentMean! / 1000).toFixed(2)}s (target ${targetS}s).`,
    };
  }

  if (current === 'finished' && !demote(solves, targetMs, rules)) {
    // still comfortably fast: keep finished instead of flickering while the window refills
    return { status: 'finished', attempts: n, recentMean, reason: 'Still fast enough.' };
  }

  let reason: string;
  if (n < rules.window)
    reason = `${rules.window - n} more solve${rules.window - n === 1 ? '' : 's'} needed to judge it (target mean ${targetS}s).`;
  else if (hasDnf)
    reason = `A DNF is in the last ${rules.window}; get ${rules.window} clean solves.`;
  else if (recentMean! > targetMs)
    reason = `Last ${rules.window} averaged ${(recentMean! / 1000).toFixed(2)}s, target is ${targetS}s.`;
  else if (slowest > targetMs * rules.slowFactor)
    reason = `One solve was too slow (${(slowest / 1000).toFixed(1)}s); be consistent.`;
  else
    reason = `Good times, but they all came on the same day. Do ${Math.max(1, rules.minDays - days + 0)} more day of practice to lock it in.`;
  return { status: 'learning', attempts: n, recentMean, reason };
}

function demote(solves: Solve[], targetMs: number, rules: LearningRules): boolean {
  const last2 = solves.slice(-2).map(eff);
  if (last2.some((t) => t === null)) return true;
  const last3 = solves
    .slice(-3)
    .map(eff)
    .filter((t): t is number => t !== null);
  if (last3.length < 3) return false;
  return last3.reduce((a, b) => a + b, 0) / 3 > targetMs * rules.demoteFactor;
}
