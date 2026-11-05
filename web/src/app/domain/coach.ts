import { Cube, parseMoves, formatMoves, invertAlg } from './cube';
import type { Move, Vec } from './cube';
import { f2lReport, pieceSolved, topCrossDone, topFaceDone } from './cube';
import { solveCross } from './cross-solver';

/**
 * The coach: looks at any position of a cube held white-down and says which stage of CFOP it is in,
 * what to look for, and (on request) the exact next moves. It never needs to know how you got there.
 */
export type Stage =
  'cross' | 'f2l' | 'oll-edges' | 'oll-corners' | 'pll-corners' | 'pll-edges' | 'auf' | 'done';

export const STAGE_ORDER: Stage[] = [
  'cross',
  'f2l',
  'oll-edges',
  'oll-corners',
  'pll-corners',
  'pll-edges',
  'auf',
  'done',
];

export const STAGE_NAMES: Record<Stage, string> = {
  cross: 'Cross',
  f2l: 'First two layers',
  'oll-edges': 'Yellow cross',
  'oll-corners': 'Yellow face',
  'pll-corners': 'Corners',
  'pll-edges': 'Edges',
  auf: 'Last turn',
  done: 'Solved',
};

const LL_CORNERS: Vec[] = [
  [1, 1, 1],
  [-1, 1, 1],
  [1, 1, -1],
  [-1, 1, -1],
];

const U = (k: number): Move[] => (k ? [{ base: 'U', turns: k as 1 | 2 | 3 }] : []);

function cornersSolvedUpToAuf(c: Cube): boolean {
  for (let k = 0; k < 4; k++) {
    const t = c.clone().apply(U(k));
    if (LL_CORNERS.every((p) => pieceSolved(t, p))) return true;
  }
  return false;
}

export function stageOf(c: Cube): Stage {
  const r = f2lReport(c);
  if (!r.crossSolved) return 'cross';
  if (r.unsolvedSlots.length) return 'f2l';
  if (c.isSolved()) return 'done';
  if (!topCrossDone(c)) return 'oll-edges';
  if (!topFaceDone(c)) return 'oll-corners';
  if (c.isSolvedUpToAuf()) return 'auf';
  if (!cornersSolvedUpToAuf(c)) return 'pll-corners';
  return 'pll-edges';
}

// ---- last layer: recognise the case by trying the 2-look algorithms ---------------------------

export interface LlCase {
  id: string;
  name: string;
  alg: string;
  /** U turns to do first so the algorithm applies (0 to 3 clockwise turns) */
  pre: number;
}

export interface LlCandidate {
  id: string;
  name: string;
  alg: string;
  group: string;
}

const preText = (n: number) => ['', 'U', 'U2', "U'"][n];

export function aufText(pre: number): string {
  return preText(pre);
}

/** Which algorithm moves this position on to the end of the current stage. */
export function recogniseLl(c: Cube, stage: Stage, cases: LlCandidate[]): LlCase | null {
  const group = stage.endsWith('edges') ? '2: Edges' : '1: Corners';
  const pool =
    stage === 'oll-edges'
      ? cases.filter((x) => x.id.startsWith('2lookoll') && x.group === '1: Edges')
      : stage === 'oll-corners'
        ? cases.filter((x) => x.id.startsWith('2lookoll') && x.group === '2: Corners')
        : stage === 'pll-corners'
          ? cases.filter((x) => x.id.startsWith('2lookpll') && x.group === '1: Corners')
          : stage === 'pll-edges'
            ? cases.filter((x) => x.id.startsWith('2lookpll') && x.group === group)
            : [];
  const done = (t: Cube) =>
    stage === 'oll-edges'
      ? topCrossDone(t) && f2lReport(t).unsolvedSlots.length === 0
      : stage === 'oll-corners'
        ? topFaceDone(t) && f2lReport(t).unsolvedSlots.length === 0
        : stage === 'pll-corners'
          ? cornersSolvedUpToAuf(t) && f2lReport(t).unsolvedSlots.length === 0
          : t.isSolvedUpToAuf();
  for (const pre of [0, 1, 2, 3]) {
    for (const k of pool) {
      const t = c.clone().apply(U(pre)).apply(k.alg);
      if (done(t)) return { id: k.id, name: k.name, alg: k.alg, pre };
    }
  }
  return null;
}

/** the U turns that finish the cube once the last layer is in place */
export function aufFinish(c: Cube): string | null {
  for (let k = 0; k < 4; k++) if (c.clone().apply(U(k)).isSolved()) return preText(k) || null;
  return null;
}

// ---- first two layers: find the easiest pair and solve it -------------------------------------

const SLOT_DEF: Record<string, { corner: Vec; edge: Vec; faces: string[]; label: string }> = {
  FR: { corner: [1, -1, 1], edge: [1, 0, 1], faces: ['R', 'F'], label: 'front-right' },
  FL: { corner: [-1, -1, 1], edge: [-1, 0, 1], faces: ['L', 'F'], label: 'front-left' },
  BR: { corner: [1, -1, -1], edge: [1, 0, -1], faces: ['R', 'B'], label: 'back-right' },
  BL: { corner: [-1, -1, -1], edge: [-1, 0, -1], faces: ['L', 'B'], label: 'back-left' },
};

export const slotLabel = (s: string): string => SLOT_DEF[s]?.label ?? s;

interface Tables {
  nameToId: Map<string, number>;
  /** trans[moveIndex][placementId] */
  trans: Record<string, Uint8Array[]>;
  moves: Record<string, Move[]>;
}
let tables: Tables | null = null;
const key = (p: Vec, n: Vec) => `${p.join(',')}|${n.join(',')}`;

function getTables(): Tables {
  if (tables) return tables;
  const solved = new Cube();
  const nameToId = new Map<string, number>();
  solved.stickers.forEach((s, i) => nameToId.set(key(s.p, s.n), i));
  const trans: Record<string, Uint8Array[]> = {};
  const moves: Record<string, Move[]> = {};
  for (const f of ['U', 'R', 'F', 'L', 'B'] as const) {
    trans[f] = [];
    moves[f] = [];
    for (const t of [1, 2, 3] as const) {
      const m: Move = { base: f, turns: t };
      const c = new Cube().apply([m]);
      const arr = new Uint8Array(54);
      c.stickers.forEach((s, i) => (arr[i] = nameToId.get(key(s.p, s.n))!));
      trans[f].push(arr);
      moves[f].push(m);
    }
  }
  tables = { nameToId, trans, moves };
  return tables;
}

/** sticker indices of the cubie that sits at (or belongs to) a position */
function stickersOf(c: Cube, p: Vec): number[] {
  const out: number[] = [];
  c.stickers.forEach((s, i) => {
    if (s.p[0] === p[0] && s.p[1] === p[1] && s.p[2] === p[2]) out.push(i);
  });
  return out;
}

export interface PairSolution {
  slot: string;
  moves: string[];
}

function searchSlot(
  c: Cube,
  slot: string,
  from: number,
  depth: number,
  faces: string[],
): string[] | null {
  const T = getTables();
  const def = SLOT_DEF[slot];
  const report = f2lReport(c);
  // pieces that must be in place at the end: the cross, this pair and any pair already finished
  const tracked: number[] = [];
  const need: Vec[] = [[0, -1, 1], [0, -1, -1], [1, -1, 0], [-1, -1, 0], def.corner, def.edge];
  for (const s of Object.keys(SLOT_DEF))
    if (s !== slot && !report.unsolvedSlots.includes(s))
      need.push(SLOT_DEF[s].corner, SLOT_DEF[s].edge);
  // a sticker belongs to a cubie by its solved identity: sticker index i is solved when it sits at
  // placement i, and stickers of a cubie are found by their position in the solved cube
  const solved = new Cube();
  for (const p of need) for (const i of stickersOf(solved, p)) tracked.push(i);
  const cur = new Uint8Array(tracked.length);
  tracked.forEach((i, k) => (cur[k] = T.nameToId.get(key(c.stickers[i].p, c.stickers[i].n))!));
  const goalOk = (st: Uint8Array) => tracked.every((i, k) => st[k] === i);
  if (goalOk(cur)) return [];
  const path: Move[] = [];
  const stack: Uint8Array[] = [];
  for (let d = 0; d <= depth; d++) stack.push(new Uint8Array(tracked.length));
  stack[0].set(cur);
  const n = tracked.length;
  const rec = (left: number, lastFace: string, depthIdx: number): boolean => {
    const st = stack[depthIdx];
    for (const f of faces) {
      if (f === lastFace) continue;
      const tf = T.trans[f];
      for (let t = 0; t < 3; t++) {
        const tr = tf[t];
        const nx = stack[depthIdx + 1];
        for (let k = 0; k < n; k++) nx[k] = tr[st[k]];
        path.push(T.moves[f][t]);
        if (left === 1) {
          let ok = true;
          for (let k = 0; k < n; k++)
            if (nx[k] !== tracked[k]) {
              ok = false;
              break;
            }
          if (ok) return true;
        } else if (rec(left - 1, f, depthIdx + 1)) return true;
        path.pop();
      }
    }
    return false;
  };
  for (let d = Math.max(1, from); d <= depth; d++) {
    path.length = 0;
    if (rec(d, '', 0)) return formatMoves(path).split(' ');
  }
  return null;
}

const MAX_DEPTH = 9;

/** the quickest pair to finish right now, with its moves (null when none is found quickly) */
export function easiestPair(c: Cube): PairSolution | null {
  const unsolved = f2lReport(c).unsolvedSlots;
  const own = (slot: string) => ['U', ...SLOT_DEF[slot].faces];
  const run = (from: number, to: number, faces?: string[]): PairSolution | null => {
    // shortest first, across all slots, so an easy pair is found without searching the hard ones
    for (let d = from; d <= to; d++)
      for (const slot of unsolved) {
        const m = searchSlot(c, slot, d, d, faces ?? own(slot));
        if (m && m.length) return { slot, moves: m };
      }
    return null;
  };
  // a piece stuck in another slot needs turns of the other faces too, so those come second
  return run(1, 7) ?? run(4, 6, ['U', 'R', 'F', 'L', 'B']) ?? run(8, MAX_DEPTH);
}

/** where the two pieces of a pair are, in words */
export function describePair(c: Cube, slot: string): string {
  const def = SLOT_DEF[slot];
  const solved = new Cube();
  const where = (home: Vec): { layer: 'top' | 'middle' | 'bottom'; inSlot: boolean } => {
    const ids = stickersOf(solved, home);
    const p = c.stickers[ids[0]].p; // stickers keep their identity, so this is where the piece is now
    return {
      layer: p[1] === 1 ? 'top' : p[1] === 0 ? 'middle' : 'bottom',
      inSlot: p.join() === home.join(),
    };
  };
  const corner = where(def.corner);
  const edge = where(def.edge);
  const cs =
    corner.layer === 'top'
      ? 'in the top layer'
      : corner.inSlot
        ? 'in its slot, twisted'
        : 'stuck in a bottom slot';
  const es =
    edge.layer === 'top'
      ? 'in the top layer'
      : edge.inSlot
        ? 'in its slot, flipped'
        : 'stuck in the middle layer';
  return `The corner is ${cs}; the edge is ${es}.`;
}

/** the optimal cross from here */
export function crossFrom(scramble: string): string[] | null {
  return solveCross(scramble, 'D')?.moves ?? null;
}

export const normalise = (alg: string): string => formatMoves(parseMoves(alg));
export const inverse = (alg: string): string => invertAlg(alg);
