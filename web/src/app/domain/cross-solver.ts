import { Cube, FACES, parseMoves, formatMove } from './cube';
import type { Face, Vec, Move } from './cube';

/**
 * Optimal cross solver (fewest face turns, HTM) for the four edges of one face.
 *
 * Works on the sticker engine: every cross edge is tracked by the placement (cubie position + normal)
 * of its sticker in the cross colour. Move effects on placements are read off a solved cube once, then a
 * plain breadth-first search over (at most 12*2 * 11*2 * 10*2 * 9*2 = 190 080) states finds the shortest
 * solution - well under a second.
 */
const FACE_MOVES: Move[] = (['U', 'R', 'F', 'D', 'L', 'B'] as const).flatMap((b) =>
  [1, 2, 3].map((t) => ({ base: b, turns: t as 1 | 2 | 3 })),
);

const key = (p: Vec, n: Vec) => `${p.join(',')}|${n.join(',')}`;

interface Tables {
  /** stickers (index in Cube.stickers) that sit on edges, per colour */
  edgeStickers: number[][];
  /** placement id of each sticker index in the solved cube */
  placementOf: Map<number, number>;
  /** trans[moveIndex][placementId] = new placementId */
  trans: Uint8Array[];
}

let cache: Tables | null = null;

function tables(): Tables {
  if (cache) return cache;
  const solved = new Cube();
  const ids = new Map<string, number>();
  const placementOf = new Map<number, number>();
  const edgeStickers: number[][] = FACES.map(() => []);
  solved.stickers.forEach((s, i) => {
    const nonZero = s.p.filter((v) => v !== 0).length;
    if (nonZero !== 2) return;
    const k = key(s.p, s.n);
    ids.set(k, ids.size);
    placementOf.set(i, ids.get(k)!);
    edgeStickers[s.c].push(i);
  });
  const trans = FACE_MOVES.map((m) => {
    const c = new Cube();
    c.applyMove(m);
    const t = new Uint8Array(ids.size);
    for (const [i, id] of placementOf) {
      const s = c.stickers[i];
      t[id] = ids.get(key(s.p, s.n))!;
    }
    return t;
  });
  cache = { edgeStickers, placementOf, trans };
  return cache;
}

export interface CrossSolution {
  moves: string[];
  length: number;
}

/**
 * @param scramble standard notation, faces only (rotations are ignored by applying them first)
 * @param face     the face whose cross to solve, in the scramble's own frame (D = bottom)
 */
export function solveCross(scramble: string, face: Face = 'D', maxDepth = 9): CrossSolution | null {
  const { edgeStickers, placementOf, trans } = tables();
  const cube = new Cube().apply(scramble);
  const pieces = edgeStickers[FACES.indexOf(face)];
  const start = pieces.map((i) => placementOf.get(placementOfSticker(cube, i))!);
  const goal = pieces.map((i) => placementOf.get(i)!);
  const enc = (a: number[]) => ((a[0] * 24 + a[1]) * 24 + a[2]) * 24 + a[3];
  const goalKey = enc(goal);

  interface Node {
    prev: number;
    move: number;
  }
  const seen = new Map<number, Node>([[enc(start), { prev: -1, move: -1 }]]);
  let frontier: number[][] = [start];
  if (enc(start) === goalKey) return { moves: [], length: 0 };

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: number[][] = [];
    for (const st of frontier) {
      const from = enc(st);
      for (let m = 0; m < FACE_MOVES.length; m++) {
        const t = trans[m];
        const ns = [t[st[0]], t[st[1]], t[st[2]], t[st[3]]];
        const k = enc(ns);
        if (seen.has(k)) continue;
        seen.set(k, { prev: from, move: m });
        if (k === goalKey) return { moves: backtrack(seen, k), length: depth };
        next.push(ns);
      }
    }
    frontier = next;
  }
  return null;
}

/** Placement id of sticker i in the scrambled cube (solved-cube ids are keyed by position+normal). */
function placementOfSticker(cube: Cube, i: number): number {
  // Find the solved-cube sticker that sits at the same position and normal; its index is the id source.
  const s = cube.stickers[i];
  const solved = tablesSolved();
  return solved.get(key(s.p, s.n))!;
}

let solvedIndex: Map<string, number> | null = null;
function tablesSolved(): Map<string, number> {
  if (solvedIndex) return solvedIndex;
  const m = new Map<string, number>();
  new Cube().stickers.forEach((s, i) => m.set(key(s.p, s.n), i));
  solvedIndex = m;
  return m;
}

function backtrack(seen: Map<number, { prev: number; move: number }>, end: number): string[] {
  const out: string[] = [];
  let k = end;
  while (true) {
    const n = seen.get(k)!;
    if (n.prev < 0) break;
    out.push(formatMove(FACE_MOVES[n.move]));
    k = n.prev;
  }
  return out.reverse();
}

/** Optimal cross length for every face (D, U, F, B, L, R in the scramble's frame). */
export function crossLengths(scramble: string): Record<Face, number | null> {
  const out = {} as Record<Face, number | null>;
  for (const f of FACES) out[f] = solveCross(scramble, f)?.length ?? null;
  return out;
}

export { parseMoves };
