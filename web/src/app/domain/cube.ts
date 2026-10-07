/**
 * Cube engine: sticker-based 3x3 simulator, move parser, random scrambler and
 * case-setup generator (inverse of an algorithm). No dependencies, so it can be
 * unit-tested with plain Node.
 */

export type Vec = [number, number, number];

export interface Sticker {
  p: Vec; // position of the cubie, each coordinate in {-1,0,1}
  n: Vec; // outward normal of the sticker
  c: number; // colour index = face the sticker started on
}

/** Face order used everywhere: U R F D L B. */
export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];

const FACE_AXIS: Record<Face, { axis: 0 | 1 | 2; sign: 1 | -1 }> = {
  U: { axis: 1, sign: 1 },
  D: { axis: 1, sign: -1 },
  R: { axis: 0, sign: 1 },
  L: { axis: 0, sign: -1 },
  F: { axis: 2, sign: 1 },
  B: { axis: 2, sign: -1 },
};

const FACE_NORMAL: Record<Face, Vec> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

/** Default colour scheme: white up, green front. */
export const FACE_COLORS: Record<Face, string> = {
  U: '#ffffff',
  R: '#d62d20',
  F: '#1fa34a',
  D: '#ffd500',
  L: '#ff7a00',
  B: '#1f5fd6',
};

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export interface Move {
  /** base letter: U R F D L B  u r f d l b  M E S  x y z */
  base: string;
  /** clockwise quarter turns: 1, 2 or 3 (3 = prime) */
  turns: 1 | 2 | 3;
}

const MOVE_RE = /^([URFDLBurfdlbMESxyz])(w)?(2'|'2|2|3|')?$/;

/** Expand repeat groups such as "(R U R' U')3" (innermost first). */
function expandGroups(text: string): string {
  let prev: string;
  let cur = text;
  do {
    prev = cur;
    cur = cur.replace(/\(([^()]*)\)\s*(\d+)/g, (_m, body: string, n: string) =>
      Array(Number(n)).fill(body).join(' '),
    );
  } while (cur !== prev);
  return cur;
}

export function parseMoves(text: string): Move[] {
  const out: Move[] = [];
  const tokens = expandGroups(text)
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  for (const raw of tokens) {
    const m = MOVE_RE.exec(raw);
    if (!m) throw new Error(`Cannot parse move "${raw}"`);
    let base = m[1];
    if (m[2]) {
      // Rw style wide move
      if (!'URFDLB'.includes(base)) throw new Error(`Bad wide move "${raw}"`);
      base = base.toLowerCase();
    }
    const suffix = m[3];
    let turns: 1 | 2 | 3 = 1;
    if (suffix === '2' || suffix === "2'" || suffix === "'2") turns = 2;
    else if (suffix === "'" || suffix === '3') turns = 3;
    out.push({ base, turns });
  }
  return out;
}

export function formatMoves(moves: Move[]): string {
  return moves.map(formatMove).join(' ');
}

export function formatMove(m: Move): string {
  return m.base + (m.turns === 1 ? '' : m.turns === 2 ? '2' : "'");
}

export function invertMoves(moves: Move[]): Move[] {
  return [...moves].reverse().map((m) => ({
    base: m.base,
    turns: (m.turns === 2 ? 2 : m.turns === 1 ? 3 : 1) as 1 | 2 | 3,
  }));
}

export function invertAlg(alg: string): string {
  return formatMoves(invertMoves(parseMoves(alg)));
}

// ---------------------------------------------------------------------------
// Cube state
// ---------------------------------------------------------------------------

function rotate(v: Vec, axis: 0 | 1 | 2, quarter: number): Vec {
  // quarter = number of +90deg right-handed rotations about the axis
  let [x, y, z] = v;
  const q = ((quarter % 4) + 4) % 4;
  for (let i = 0; i < q; i++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [z, x] = [-x, z];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

/**
 * What a move does geometrically, for drawing it: which cubies turn, about which axis and by how
 * many +90 degree (right-handed) quarter turns. Mirrors `Cube.applyMove` exactly (tested).
 */
export interface MoveSpec {
  axis: 0 | 1 | 2;
  /** signed number of +90deg right-handed turns about `axis` (x right, y up, z towards the viewer) */
  quarter: number;
  /** does the cubie at position p take part in the turn? */
  inLayer: (p: Vec) => boolean;
  /** true for whole-cube rotations (x y z) */
  whole: boolean;
}

export function moveSpec(m: Move): MoveSpec {
  const t = m.turns;
  const b = m.base;
  const face = (
    f: Face,
    pred: (p: Vec, axis: 0 | 1 | 2, sign: number) => boolean,
    whole = false,
  ) => {
    const { axis, sign } = FACE_AXIS[f];
    return {
      axis,
      quarter: -sign * t,
      inLayer: (p: Vec) => pred(p, axis, sign),
      whole,
    } satisfies MoveSpec;
  };
  if ('URFDLB'.includes(b)) return face(b as Face, (p, a, sg) => p[a] * sg === 1);
  if ('urfdlb'.includes(b)) return face(b.toUpperCase() as Face, (p, a, sg) => p[a] * sg >= 0);
  if (b === 'M') return face('L', (p) => p[0] === 0);
  if (b === 'E') return face('D', (p) => p[1] === 0);
  if (b === 'S') return face('F', (p) => p[2] === 0);
  if (b === 'x') return face('R', () => true, true);
  if (b === 'y') return face('U', () => true, true);
  if (b === 'z') return face('F', () => true, true);
  throw new Error(`Unknown move ${b}`);
}

/** Plain-English description of a move, for learners. */
export function describeMove(m: Move): string {
  const dir =
    m.turns === 1 ? 'clockwise' : m.turns === 3 ? 'counter-clockwise' : 'a half turn (180°)';
  const names: Record<string, string> = {
    U: 'Top face',
    D: 'Bottom face',
    R: 'Right face',
    L: 'Left face',
    F: 'Front face',
    B: 'Back face',
    u: 'Top two layers',
    d: 'Bottom two layers',
    r: 'Right two layers',
    l: 'Left two layers',
    f: 'Front two layers',
    b: 'Back two layers',
    M: 'Middle slice (between left and right)',
    E: 'Equator slice (between top and bottom)',
    S: 'Standing slice (between front and back)',
  };
  if ('xyz'.includes(m.base)) {
    const axis = m.base === 'x' ? 'right' : m.base === 'y' ? 'top' : 'front';
    return `Rotate the whole cube like the ${axis} face, ${dir}`;
  }
  const where = 'MES'.includes(m.base)
    ? m.base === 'M'
      ? ' (follows L)'
      : m.base === 'E'
        ? ' (follows D)'
        : ' (follows F)'
    : '';
  return `${names[m.base]}${where} ${dir}${m.turns === 2 ? '' : ', seen from that side'}`;
}

export class Cube {
  stickers: Sticker[] = [];

  constructor() {
    this.reset();
  }

  reset(): void {
    this.stickers = [];
    for (const f of FACES) {
      const n = FACE_NORMAL[f];
      const c = FACES.indexOf(f);
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const p: Vec = [0, 0, 0];
          if (n[0] !== 0) {
            p[0] = n[0];
            p[1] = a;
            p[2] = b;
          } else if (n[1] !== 0) {
            p[1] = n[1];
            p[0] = a;
            p[2] = b;
          } else {
            p[2] = n[2];
            p[0] = a;
            p[1] = b;
          }
          this.stickers.push({ p, n: [...n] as Vec, c });
        }
      }
    }
  }

  clone(): Cube {
    const c = new Cube();
    c.stickers = this.stickers.map((s) => ({ p: [...s.p] as Vec, n: [...s.n] as Vec, c: s.c }));
    return c;
  }

  /** Turn all stickers whose predicate holds, clockwise `turns` quarter turns as seen from `face`. */
  private turn(face: Face, turns: number, pred: (s: Sticker) => boolean): void {
    const { axis, sign } = FACE_AXIS[face];
    // clockwise seen from outside = -90deg about the outward normal
    const quarter = -sign * turns;
    for (const s of this.stickers) {
      if (!pred(s)) continue;
      s.p = rotate(s.p, axis, quarter);
      s.n = rotate(s.n, axis, quarter);
    }
  }

  applyMove(m: Move): void {
    const t = m.turns;
    const b = m.base;
    if ('URFDLB'.includes(b)) {
      const f = b as Face;
      const { axis, sign } = FACE_AXIS[f];
      this.turn(f, t, (s) => s.p[axis] * sign === 1);
    } else if ('urfdlb'.includes(b)) {
      const f = b.toUpperCase() as Face;
      const { axis, sign } = FACE_AXIS[f];
      this.turn(f, t, (s) => s.p[axis] * sign >= 0);
    } else if (b === 'M') {
      this.turn('L', t, (s) => s.p[0] === 0);
    } else if (b === 'E') {
      this.turn('D', t, (s) => s.p[1] === 0);
    } else if (b === 'S') {
      this.turn('F', t, (s) => s.p[2] === 0);
    } else if (b === 'x') {
      this.turn('R', t, () => true);
    } else if (b === 'y') {
      this.turn('U', t, () => true);
    } else if (b === 'z') {
      this.turn('F', t, () => true);
    } else {
      throw new Error(`Unknown move ${b}`);
    }
  }

  apply(moves: Move[] | string): this {
    const list = typeof moves === 'string' ? parseMoves(moves) : moves;
    for (const m of list) this.applyMove(m);
    return this;
  }

  /** Colour index on the sticker at cubie position p with outward normal n. */
  colorAt(p: Vec, n: Vec): number {
    for (const s of this.stickers) {
      if (
        s.p[0] === p[0] &&
        s.p[1] === p[1] &&
        s.p[2] === p[2] &&
        s.n[0] === n[0] &&
        s.n[1] === n[1] &&
        s.n[2] === n[2]
      ) {
        return s.c;
      }
    }
    return -1;
  }

  /** 9 colour indices of a face, row-major as the face is seen from outside (standard net layout). */
  faceGrid(face: Face): number[] {
    const out: number[] = [];
    const n = FACE_NORMAL[face];
    // Row/column directions (right, down) for each face, standard net layout.
    const dirs: Record<Face, { right: Vec; down: Vec }> = {
      U: { right: [1, 0, 0], down: [0, 0, 1] },
      D: { right: [1, 0, 0], down: [0, 0, -1] },
      F: { right: [1, 0, 0], down: [0, -1, 0] },
      B: { right: [-1, 0, 0], down: [0, -1, 0] },
      R: { right: [0, 0, -1], down: [0, -1, 0] },
      L: { right: [0, 0, 1], down: [0, -1, 0] },
    };
    const { right, down } = dirs[face];
    for (let r = -1; r <= 1; r++) {
      for (let c = -1; c <= 1; c++) {
        const p: Vec = [
          n[0] + right[0] * c + down[0] * r,
          n[1] + right[1] * c + down[1] * r,
          n[2] + right[2] * c + down[2] * r,
        ];
        out.push(this.colorAt(p, n));
      }
    }
    return out;
  }

  /** True if every face shows a single colour (orientation of the whole cube is irrelevant). */
  isSolved(): boolean {
    for (const f of FACES) {
      const g = this.faceGrid(f);
      if (g.some((c) => c !== g[0])) return false;
    }
    return true;
  }

  /** Solved ignoring a final U-layer turn (AUF) and any whole-cube rotation. */
  isSolvedUpToAuf(): boolean {
    for (let k = 0; k < 4; k++) {
      const c = this.clone();
      if (k) c.applyMove({ base: 'U', turns: k as 1 | 2 | 3 });
      if (c.isSolved()) return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Rotation removal (so scrambles shown to the user contain only face turns)
// ---------------------------------------------------------------------------

type FrameMap = Record<Face, Face>;

const ROT_MAPS: Record<'x' | 'y' | 'z', Record<Face, Face>> = {
  // new face name -> face it was called before the rotation
  x: { U: 'F', B: 'U', D: 'B', F: 'D', R: 'R', L: 'L' },
  y: { F: 'R', R: 'B', B: 'L', L: 'F', U: 'U', D: 'D' },
  z: { R: 'U', D: 'R', L: 'D', U: 'L', F: 'F', B: 'B' },
};

/** Rewrite wide/slice moves as face turns + rotations. */
function expandSpecial(moves: Move[]): Move[] {
  const out: Move[] = [];
  const push = (base: string, turns: 1 | 2 | 3) => out.push({ base, turns });
  const inv = (t: 1 | 2 | 3): 1 | 2 | 3 => (t === 2 ? 2 : t === 1 ? 3 : 1);
  for (const m of moves) {
    const t = m.turns;
    switch (m.base) {
      case 'M': // x' R L'
        push('x', inv(t));
        push('R', t);
        push('L', inv(t));
        break;
      case 'E': // y' U D'
        push('y', inv(t));
        push('U', t);
        push('D', inv(t));
        break;
      case 'S': // z F' B
        push('z', t);
        push('F', inv(t));
        push('B', t);
        break;
      case 'r':
        push('L', t);
        push('x', t);
        break;
      case 'l':
        push('R', t);
        push('x', inv(t));
        break;
      case 'u':
        push('D', t);
        push('y', t);
        break;
      case 'd':
        push('U', t);
        push('y', inv(t));
        break;
      case 'f':
        push('B', t);
        push('z', t);
        break;
      case 'b':
        push('F', t);
        push('z', inv(t));
        break;
      default:
        out.push(m);
    }
  }
  return out;
}

const IDENTITY_MAP: FrameMap = { U: 'U', R: 'R', F: 'F', D: 'D', L: 'L', B: 'B' };

function stepMap(map: FrameMap, axis: 'x' | 'y' | 'z'): FrameMap {
  const r = ROT_MAPS[axis];
  const next = {} as FrameMap;
  for (const f of FACES) next[f] = map[r[f]];
  return next;
}

function sameMap(a: FrameMap, b: FrameMap): boolean {
  return FACES.every((f) => a[f] === b[f]);
}

const ROT_TOKENS: Move[] = [
  { base: 'x', turns: 1 },
  { base: 'x', turns: 3 },
  { base: 'x', turns: 2 },
  { base: 'y', turns: 1 },
  { base: 'y', turns: 3 },
  { base: 'y', turns: 2 },
  { base: 'z', turns: 1 },
  { base: 'z', turns: 3 },
  { base: 'z', turns: 2 },
];

/** Shortest rotation sequence (max 3 moves) that produces the given frame map. */
function rotationsFor(target: FrameMap): Move[] {
  if (sameMap(target, IDENTITY_MAP)) return [];
  const run = (seq: Move[]): FrameMap => {
    let m = IDENTITY_MAP;
    for (const r of seq)
      for (let i = 0; i < r.turns; i++) m = stepMap(m, r.base as 'x' | 'y' | 'z');
    return m;
  };
  for (const a of ROT_TOKENS) if (sameMap(run([a]), target)) return [a];
  for (const a of ROT_TOKENS)
    for (const b of ROT_TOKENS) if (sameMap(run([a, b]), target)) return [a, b];
  for (const a of ROT_TOKENS)
    for (const b of ROT_TOKENS)
      for (const c of ROT_TOKENS) {
        if (sameMap(run([a, b, c]), target)) return [a, b, c];
      }
  throw new Error('No rotation sequence found');
}

/**
 * Equivalent move list in which every turn is a plain U R F D L B face turn, followed by the
 * (at most three) whole-cube rotations needed to leave the cube in the same orientation as the
 * original sequence. Rotations in the middle of a sequence disappear into relabelled faces.
 */
export function removeRotations(moves: Move[]): Move[] {
  let map: FrameMap = IDENTITY_MAP;
  const out: Move[] = [];
  for (const m of expandSpecial(moves)) {
    if (m.base === 'x' || m.base === 'y' || m.base === 'z') {
      for (let i = 0; i < m.turns; i++) map = stepMap(map, m.base);
    } else {
      out.push({ base: map[m.base as Face], turns: m.turns });
    }
  }
  return [...out, ...rotationsFor(map)];
}

// ---------------------------------------------------------------------------
// Scramblers
// ---------------------------------------------------------------------------

export type Rng = () => number;

const SCRAMBLE_FACES: Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];
const AXIS_OF: Record<Face, number> = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };

/** Random-move scramble in the WCA style: no repeated face, no useless same-axis triples. */
export function randomScramble(length = 20, rng: Rng = Math.random): string {
  const moves: Move[] = [];
  let lastAxis = -1;
  let prevAxis = -1;
  const used: Face[] = [];
  while (moves.length < length) {
    const f = SCRAMBLE_FACES[Math.floor(rng() * 6)];
    const axis = AXIS_OF[f];
    if (axis === lastAxis) {
      // allow two moves on the same axis only if they are different faces and axis not used 3 times in a row
      if (prevAxis === axis) continue;
      if (used[used.length - 1] === f) continue;
    }
    const turns = (1 + Math.floor(rng() * 3)) as 1 | 2 | 3;
    moves.push({ base: f, turns });
    used.push(f);
    prevAxis = lastAxis;
    lastAxis = axis;
  }
  return formatMoves(moves);
}

export interface CaseScramble {
  /** moves (plus at most three whole-cube rotations at the end) to perform from a solved cube */
  scramble: string;
  /** the algorithm that solves the case */
  solution: string;
  /**
   * Number of clockwise U turns applied to the last layer after the setup, i.e. how far the case is
   * rotated away from the orientation the algorithm expects. 0 = case exactly as in the algorithm
   * picture. The solver fixes this with a pre-AUF (U turns of the opposite direction) before the alg.
   */
  auf: number;
}

/**
 * Scramble that produces exactly the case solved by `alg`, with everything outside the case
 * (e.g. F2L for OLL/PLL) left solved. Works from any solved cube: the layer you scrambled with
 * on top is the last layer. With `randomAuf` the case is shown rotated by a random U turn.
 */
export function caseScramble(alg: string, rng: Rng = Math.random, randomAuf = false): CaseScramble {
  const auf = randomAuf ? Math.floor(rng() * 4) : 0;
  const setup: Move[] = [...invertMoves(parseMoves(alg))];
  if (auf) setup.push({ base: 'U', turns: auf as 1 | 2 | 3 });
  return { scramble: formatMoves(removeRotations(setup)), solution: alg, auf };
}

/** Build the cube state after a scramble (for drawing the net). */
export function stateAfter(scramble: string): Cube {
  return new Cube().apply(scramble);
}

// ---------------------------------------------------------------------------
// Analysis helpers (used by the case builders and the tests)
// ---------------------------------------------------------------------------

function centerColors(cube: Cube): Map<number, Vec> {
  // colour index -> where that centre currently is
  const m = new Map<number, Vec>();
  for (const s of cube.stickers) {
    if (s.p[0] === s.n[0] && s.p[1] === s.n[1] && s.p[2] === s.n[2]) m.set(s.c, s.n);
  }
  return m;
}

/**
 * Canonical description of a state *relative to its centres*, in the frame the solver is holding the
 * cube in. Two scrambles with the same key are the same case in the same position, so any algorithm
 * for one solves the other.
 */
export function relativeKey(cube: Cube): string {
  const centers = centerColors(cube);
  return cube.stickers
    .map((s) => {
      const c = centers.get(s.c)!;
      return `${s.p.join(',')}|${s.n.join(',')}|${c.join(',')}`;
    })
    .sort()
    .join(';');
}

/** All stickers of the cubie at p show the colour of the centre on the face they are on. */
export function pieceSolved(cube: Cube, p: Vec): boolean {
  const centers = centerColors(cube);
  for (const s of cube.stickers) {
    if (s.p[0] !== p[0] || s.p[1] !== p[1] || s.p[2] !== p[2]) continue;
    const c = centers.get(s.c)!;
    if (c[0] !== s.n[0] || c[1] !== s.n[1] || c[2] !== s.n[2]) return false;
  }
  return true;
}

const CROSS_EDGES: Vec[] = [
  [0, -1, 1],
  [0, -1, -1],
  [1, -1, 0],
  [-1, -1, 0],
];
const SLOTS: { name: string; corner: Vec; edge: Vec }[] = [
  { name: 'FR', corner: [1, -1, 1], edge: [1, 0, 1] },
  { name: 'FL', corner: [-1, -1, 1], edge: [-1, 0, 1] },
  { name: 'BR', corner: [1, -1, -1], edge: [1, 0, -1] },
  { name: 'BL', corner: [-1, -1, -1], edge: [-1, 0, -1] },
];

export interface F2lReport {
  /** the four bottom-layer edges are solved */
  crossSolved: boolean;
  /** F2L slots (corner + edge) that are not completely solved */
  unsolvedSlots: string[];
  /** last-layer pieces (top layer, 8 pieces) that are not solved */
  llUnsolved: number;
}

/** Analyse a state assuming the cross layer is the bottom (D) face of the cube as held. */
export function f2lReport(cube: Cube): F2lReport {
  const crossSolved = CROSS_EDGES.every((p) => pieceSolved(cube, p));
  const unsolvedSlots = SLOTS.filter(
    (s) => !(pieceSolved(cube, s.corner) && pieceSolved(cube, s.edge)),
  ).map((s) => s.name);
  let ll = 0;
  for (let x = -1; x <= 1; x++)
    for (let z = -1; z <= 1; z++) {
      if (x === 0 && z === 0) continue;
      if (!pieceSolved(cube, [x, 1, z])) ll++;
    }
  return { crossSolved, unsolvedSlots, llUnsolved: ll };
}

/**
 * Like relativeKey but only for the cross and F2L pieces (every piece without a top-colour sticker).
 * Last-layer pieces are ignored, because two algorithms for the same F2L case may leave the top layer
 * turned differently. Equal keys mean the same F2L case, in the same slot.
 */
export function f2lKey(cube: Cube): string {
  const centers = centerColors(cube);
  const top = centers.get(FACES.indexOf('U'))!; // the colour of the original U face is the cross-opposite colour
  const byPiece = new Map<string, Sticker[]>();
  for (const s of cube.stickers) {
    const k = s.p.join(',');
    byPiece.set(k, [...(byPiece.get(k) ?? []), s]);
  }
  const parts: string[] = [];
  for (const stickers of byPiece.values()) {
    if (stickers.length < 2) continue; // centres
    if (stickers.some((s) => s.c === FACES.indexOf('U'))) continue; // last-layer piece
    for (const s of stickers)
      parts.push(`${s.p.join(',')}|${s.n.join(',')}|${centers.get(s.c)!.join(',')}`);
  }
  void top;
  return parts.sort().join(';');
}
