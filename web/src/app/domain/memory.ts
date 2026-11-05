import { dayIndex } from './plan';

/**
 * How well one algorithm is remembered, as opposed to how fast it is executed (that is `learning.ts`).
 *
 * The loop for a new algorithm: see it (seen) -> type it from memory (recalled) -> type it again after
 * 1, 3, 7, 14, 30, 60 days. Every successful recall that was due moves the case one box up and pushes
 * the next check further out; a failed one sends it two boxes back and makes it due again straight away.
 */
export const RECALL_DAYS = [1, 3, 7, 14, 30, 60];
const DAY = 86400000;

export interface CaseMemory {
  /** when it was first shown in a lesson */
  introducedAt: number;
  /** successful recalls in total */
  passes: number;
  lapses: number;
  /** 0..5, index into RECALL_DAYS */
  box: number;
  lastAt: number;
  /** when the next recall check is due (0 while it has never been recalled) */
  nextAt: number;
}

export type RecallState = 'new' | 'seen' | 'recalled' | 'solid';

export function introduce(now: number): CaseMemory {
  return { introducedAt: now, passes: 0, lapses: 0, box: 0, lastAt: 0, nextAt: 0 };
}

export function recallState(m: CaseMemory | undefined): RecallState {
  if (!m) return 'new';
  if (m.passes === 0) return 'seen';
  return m.box >= 3 ? 'solid' : 'recalled';
}

export const isRecalled = (m: CaseMemory | undefined): boolean => !!m && m.passes > 0;

export function isDue(m: CaseMemory | undefined, now: number): boolean {
  return !!m && m.passes > 0 && m.nextAt <= now;
}

/** Apply the outcome of one recall attempt. An early success (not yet due) does not move the box. */
export function applyRecall(m: CaseMemory | undefined, ok: boolean, now: number): CaseMemory {
  const cur = m ?? introduce(now);
  if (!ok) {
    return {
      ...cur,
      lapses: cur.lapses + 1,
      box: Math.max(0, cur.box - 2),
      lastAt: now,
      nextAt: cur.passes > 0 ? now : 0,
    };
  }
  const first = cur.passes === 0;
  const due = first || cur.nextAt <= now;
  const box = first ? 0 : due ? Math.min(RECALL_DAYS.length - 1, cur.box + 1) : cur.box;
  return {
    ...cur,
    passes: cur.passes + 1,
    box,
    lastAt: now,
    nextAt: due ? now + RECALL_DAYS[box] * DAY : cur.nextAt,
  };
}

/** Cases first shown today: used to cap how many new algorithms are taken in per day. */
export function introducedToday(
  memory: Record<string, CaseMemory>,
  now: number,
  tzOffsetMin = 0,
): number {
  const today = dayIndex(now, tzOffsetMin);
  let n = 0;
  for (const m of Object.values(memory)) if (dayIndex(m.introducedAt, tzOffsetMin) === today) n++;
  return n;
}

/** Case ids whose recall check is due, most overdue first. */
export function dueRecalls(memory: Record<string, CaseMemory>, now: number): string[] {
  return Object.entries(memory)
    .filter(([, m]) => isDue(m, now))
    .sort((a, b) => a[1].nextAt - b[1].nextAt)
    .map(([id]) => id);
}

/**
 * Splits an algorithm into small pieces that are easier to hold in memory: bracketed groups stay
 * together, well-known triggers get their name, anything else is cut into runs of at most four moves.
 */
export interface Chunk {
  moves: string;
  /** a name worth remembering ("sexy move"), when the piece is a known trigger */
  hook?: string;
}

const TRIGGERS: { moves: string; hook: string }[] = [
  { moves: "R U R' U'", hook: 'sexy move' },
  { moves: "U R U' R'", hook: 'sexy move (reversed order)' },
  { moves: "R' F R F'", hook: 'sledgehammer' },
  { moves: "F R U R' U' F'", hook: 'F, sexy move, F′' },
  { moves: "R U R'", hook: 'right-hand insert' },
  { moves: "R U' R'", hook: 'right-hand insert' },
  { moves: "R' U' R", hook: 'right-hand insert' },
  { moves: "R' U R", hook: 'right-hand insert' },
];

export function chunkAlg(alg: string): Chunk[] {
  const clean = alg.replace(/[‘’′`]/g, "'").trim();
  const groups = [...clean.matchAll(/\(([^)]*)\)|([^()\s][^()]*)/g)]
    .map((m) => (m[1] ?? m[2]).trim())
    .filter(Boolean);
  const parts = clean.includes('(') ? groups : [clean];
  const out: Chunk[] = [];
  for (const part of parts) {
    let rest = part.split(/\s+/).filter(Boolean);
    while (rest.length) {
      const hit = TRIGGERS.map((t) => ({ t, n: t.moves.split(' ').length })).find(
        ({ t, n }) => rest.slice(0, n).join(' ') === t.moves,
      );
      if (hit) {
        out.push({ moves: hit.t.moves, hook: hit.t.hook });
        rest = rest.slice(hit.n);
      } else {
        // take moves up to the next known trigger, at most four at a time
        let take = 1;
        while (
          take < 4 &&
          take < rest.length &&
          !TRIGGERS.some(
            (t) => rest.slice(take, take + t.moves.split(' ').length).join(' ') === t.moves,
          )
        )
          take++;
        out.push({ moves: rest.slice(0, take).join(' ') });
        rest = rest.slice(take);
      }
    }
  }
  return out;
}
