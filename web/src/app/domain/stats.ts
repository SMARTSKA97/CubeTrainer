export type Penalty = 'none' | 'plus2' | 'dnf';
export type SolveMode = 'random' | 'case';
/** What part of the solve was practised: the whole solve or one CFOP stage. */
export type Stage = 'full' | 'cross' | 'f2l' | 'oll' | 'pll' | 'll';
export const STAGES: { id: Stage; label: string }[] = [
  { id: 'full', label: 'Full solve' },
  { id: 'cross', label: 'Cross' },
  { id: 'f2l', label: 'F2L' },
  { id: 'oll', label: 'OLL' },
  { id: 'pll', label: 'PLL' },
  { id: 'll', label: 'Last layer' },
];
/** Quick "what went wrong" tags for a solve. */
export const MISTAKES: { id: string; label: string }[] = [
  { id: 'pause', label: 'Pause / lost track' },
  { id: 'recog', label: 'Misrecognised case' },
  { id: 'exec', label: 'Misexecuted alg' },
  { id: 'lockup', label: 'Lock-up' },
  { id: 'pop', label: 'Piece popped' },
  { id: 'cross', label: 'Bad cross' },
];

export interface Solve {
  id: string;
  /** epoch milliseconds when the solve finished */
  at: number;
  /** raw stopwatch time in ms (without penalty) */
  timeMs: number;
  penalty: Penalty;
  scramble: string;
  mode: SolveMode;
  /** only for mode === 'case' */
  setId?: string;
  caseId?: string;
  /** random AUF used for a case scramble (0-3) */
  auf?: number;
  /** inspection time used, in ms (0 if inspection was off) */
  inspectionMs?: number;
  /** timer solves: which stage was practised (missing = full solve) */
  stage?: Stage;
  /** mistake tags (see MISTAKES) */
  tags?: string[];
}

export type CaseStatus = 'unlearned' | 'learning' | 'finished';

/** Time including penalty, or null for DNF. */
export function effective(s: Pick<Solve, 'timeMs' | 'penalty'>): number | null {
  if (s.penalty === 'dnf') return null;
  return s.timeMs + (s.penalty === 'plus2' ? 2000 : 0);
}

export function formatTime(ms: number | null | undefined, digits = 2): string {
  if (ms === null || ms === undefined) return 'DNF';
  const total = ms / 1000;
  if (total < 60) return total.toFixed(digits);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(digits).padStart(digits + 3, '0')}`;
}

export function formatSolve(s: Solve | undefined): string {
  if (!s) return '-';
  const e = effective(s);
  if (e === null) return 'DNF';
  return formatTime(e) + (s.penalty === 'plus2' ? '+' : '');
}

export function best(solves: Solve[]): number | null {
  let b: number | null = null;
  for (const s of solves) {
    const e = effective(s);
    if (e !== null && (b === null || e < b)) b = e;
  }
  return b;
}

export function mean(solves: Solve[]): number | null {
  const times = solves.map(effective).filter((x): x is number => x !== null);
  if (!times.length) return null;
  return times.reduce((a, b) => a + b, 0) / times.length;
}

/**
 * WCA-style average of N: drop the best and the worst (a DNF counts as the worst) and average the
 * rest; more than one DNF makes the whole average DNF. `solves` must be oldest -> newest.
 * Uses the newest N solves; returns undefined while there are fewer than N solves.
 */
export function averageOf(solves: Solve[], n: number): number | null | undefined {
  if (solves.length < n) return undefined;
  const last = solves.slice(-n).map(effective);
  const dnfs = last.filter((x) => x === null).length;
  const cut = n >= 100 ? Math.ceil(n * 0.05) : 1;
  if (dnfs > cut) return null;
  const nums = last.map((x) => (x === null ? Infinity : x)).sort((a, b) => a - b);
  const kept = nums.slice(cut, nums.length - cut);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/** Best average of N over the whole history. */
export function bestAverageOf(solves: Solve[], n: number): number | null {
  let b: number | null = null;
  for (let i = n; i <= solves.length; i++) {
    const a = averageOf(solves.slice(i - n, i), n);
    if (typeof a === 'number' && (b === null || a < b)) b = a;
  }
  return b;
}

export interface SessionStats {
  count: number;
  best: number | null;
  mean: number | null;
  ao5: number | null | undefined;
  ao12: number | null | undefined;
  ao100: number | null | undefined;
  bestAo5: number | null;
  bestAo12: number | null;
}

export function sessionStats(solves: Solve[]): SessionStats {
  return {
    count: solves.length,
    best: best(solves),
    mean: mean(solves),
    ao5: averageOf(solves, 5),
    ao12: averageOf(solves, 12),
    ao100: averageOf(solves, 100),
    bestAo5: bestAverageOf(solves, 5),
    bestAo12: bestAverageOf(solves, 12),
  };
}

/** Compare attempts on the same scramble (oldest first). */
export interface RetryComparison {
  attempts: number;
  best: number | null;
  last: number | null;
}

export function retryComparison(history: Solve[], scramble: string): RetryComparison {
  const same = history.filter((s) => s.scramble === scramble).sort((a, b) => a.at - b.at);
  return {
    attempts: same.length,
    best: best(same),
    last: same.length ? effective(same[same.length - 1]) : null,
  };
}

export function fmtAvg(v: number | null | undefined): string {
  if (v === undefined) return '-';
  return formatTime(v);
}
