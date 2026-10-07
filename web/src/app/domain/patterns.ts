/**
 * Learning aids for algorithms: finds the building blocks people actually memorise (triggers such as
 * the "sexy move"), repeats, setup-and-undo and commutator structure, and cuts the algorithm into
 * short named chunks. Pure functions, no dependencies beyond the move parser.
 */
import { formatMoves, invertMoves, parseMoves } from './cube';
import type { Move } from './cube';

export interface Chunk {
  /** index of the first move (inclusive) and one past the last move, in the full move list */
  from: number;
  to: number;
  /** a name people use for this block, when there is one */
  name?: string;
  /** a short hint on why it is worth knowing */
  tip?: string;
  /** how many times the block repeats back to back (1 = once) */
  repeat: number;
  /** set on the first chunk of a stage (for example "Step 1 · Orient") so a heading can be drawn */
  stage?: string;
  stageTip?: string;
}

interface Known {
  alg: string;
  name: string;
  tip: string;
}

const KNOWN: Known[] = [
  {
    alg: "R U R' U'",
    name: 'Sexy move',
    tip: 'The most common trigger in cubing. Practise it until it runs on its own.',
  },
  {
    alg: "U R U' R'",
    name: 'Reverse sexy',
    tip: 'The sexy move backwards: undoes it, so it often appears right after one.',
  },
  {
    alg: "R' F R F'",
    name: 'Sledgehammer',
    tip: 'Pairs up pieces and swaps edges and corners; a fast right-hand trigger.',
  },
  { alg: "F R' F' R", name: 'Reverse sledgehammer', tip: 'The sledgehammer in reverse.' },
  {
    alg: "R U R' U R U2 R'",
    name: 'Sune',
    tip: 'Turns three corners at once. Learn it as one flowing motion.',
  },
  {
    alg: "R U2 R' U' R U' R'",
    name: 'Antisune',
    tip: 'Sune mirrored and reversed: same fingers, opposite twist.',
  },
  { alg: "L' U' L U' L' U2 L", name: 'Left Sune', tip: 'Sune for your left hand.' },
  { alg: "L U2 L' U L U L'", name: 'Left Antisune', tip: 'Antisune for your left hand.' },
  {
    alg: "F R U R' U' F'",
    name: 'Edge flip: F, sexy, F′',
    tip: 'Flips last-layer edges. Set up with F, do the trigger, undo with F′.',
  },
  {
    alg: "f R U R' U' f'",
    name: 'Edge flip: f, sexy, f′',
    tip: 'Same idea as F-sexy-F′, with a wide turn so it handles different shapes.',
  },
  { alg: "R U2 R'", name: 'Right slot: U2', tip: 'Tucks a piece away with a half turn on top.' },
  { alg: "R' U2 R", name: 'Right slot: U2 reverse', tip: 'Same tuck from the other side.' },
  { alg: "R U R'", name: 'Insert', tip: 'Brings a piece in on the right: up, over, back.' },
  {
    alg: "R' U' R",
    name: 'Insert (reverse)',
    tip: 'Brings a piece in on the right, the other way.',
  },
  {
    alg: "R U' R'",
    name: 'Insert (twist)',
    tip: 'Right-hand insert with the top turned the other way.',
  },
  { alg: "R' U R", name: 'Insert (twist reverse)', tip: 'Right-hand insert, other direction.' },
  { alg: "L' U' L", name: 'Left insert', tip: 'The mirror image of R U R′ for your left hand.' },
  { alg: "L U L'", name: 'Left insert (reverse)', tip: 'Left-hand insert, other direction.' },
  { alg: "L' U L", name: 'Left insert (twist)', tip: 'Left-hand insert, twisted.' },
  {
    alg: "L U' L'",
    name: 'Left insert (twist reverse)',
    tip: 'Left-hand insert, twisted reverse.',
  },
];

const PARSED = KNOWN.map((k) => ({ ...k, moves: parseMoves(k.alg) })).sort(
  (a, b) => b.moves.length - a.moves.length,
);

const same = (a: Move, b: Move) => a.base === b.base && a.turns === b.turns;

function matchAt(moves: Move[], at: number, pat: Move[]): boolean {
  if (at + pat.length > moves.length) return false;
  for (let i = 0; i < pat.length; i++) if (!same(moves[at + i], pat[i])) return false;
  return true;
}

function countRepeats(moves: Move[], at: number, pat: Move[]): number {
  let r = 0;
  while (matchAt(moves, at + r * pat.length, pat)) r++;
  return r;
}

/** Cut an algorithm into named blocks, repeats and short runs of free moves. Covers every move once. */
export function chunkAlg(moves: Move[]): Chunk[] {
  const out: Chunk[] = [];
  let i = 0;
  let freeStart = -1;
  const flushFree = (end: number) => {
    if (freeStart < 0) return;
    // Free moves are cut into short runs (at most 3) so each piece is easy to hold in your head.
    let s = freeStart;
    while (s < end) {
      const left = end - s;
      const len = left <= 3 ? left : left === 4 ? 2 : 3;
      out.push({ from: s, to: s + len, repeat: 1 });
      s += len;
    }
    freeStart = -1;
  };
  while (i < moves.length) {
    const known = PARSED.find((k) => matchAt(moves, i, k.moves));
    if (known) {
      flushFree(i);
      const r = countRepeats(moves, i, known.moves);
      out.push({
        from: i,
        to: i + known.moves.length * r,
        name: r > 1 ? `${known.name} ×${r}` : known.name,
        tip: known.tip,
        repeat: r,
      });
      i += known.moves.length * r;
      continue;
    }
    // Any other block of 2-6 moves that repeats back to back.
    let found = false;
    for (let p = 2; p <= 6 && !found; p++) {
      if (i + p * 2 > moves.length) break;
      const pat = moves.slice(i, i + p);
      const r = countRepeats(moves, i, pat);
      if (r >= 2) {
        flushFree(i);
        out.push({
          from: i,
          to: i + p * r,
          name: `${formatMoves(pat)} ×${r}`,
          tip: 'A short block repeated: learn it once, then count the repeats.',
          repeat: r,
        });
        i += p * r;
        found = true;
      }
    }
    if (found) continue;
    if (freeStart < 0) freeStart = i;
    i++;
  }
  flushFree(moves.length);
  return out;
}

export interface Insight {
  title: string;
  text: string;
}

/** Structure worth knowing: setup and undo (conjugate), commutator shape, length. */
export function insightsFor(moves: Move[]): Insight[] {
  const out: Insight[] = [];
  const n = moves.length;
  if (n === 0) return out;
  const halves = moves.filter((m) => m.turns === 2).length;
  const rotations = moves.filter((m) => 'xyz'.includes(m.base)).length;
  const bits = [
    halves ? `${halves} half turn${halves === 1 ? '' : 's'}` : '',
    rotations ? `${rotations} whole-cube rotation${rotations === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  out.push({
    title: `${n} move${n === 1 ? '' : 's'}`,
    text: bits.length ? bits.join(' · ') : 'Quarter turns only: easy on the fingers.',
  });

  // Commutator: A B A' B'
  for (let a = 1; a < n / 2 && 2 * a < n; a++) {
    const b = n / 2 - a;
    if (!Number.isInteger(b) || b < 1) continue;
    const A = moves.slice(0, a);
    const B = moves.slice(a, a + b);
    const rest = moves.slice(a + b);
    const want = [...invertMoves(A), ...invertMoves(B)];
    if (rest.length === want.length && want.every((w, k) => same(w, rest[k]))) {
      out.push({
        title: 'Commutator shape',
        text: `${formatMoves(A)} · ${formatMoves(B)} · ${formatMoves(invertMoves(A))} · ${formatMoves(invertMoves(B))}. Learn the first half and the second half writes itself.`,
      });
      break;
    }
  }

  // Setup and undo: A ... A'
  let k = 0;
  while (k < Math.floor(n / 2) && same(moves[k], invertMoves([moves[n - 1 - k]])[0])) k++;
  if (k >= 1 && n - 2 * k >= 1) {
    out.push({
      title: 'Setup and undo',
      text: `Starts with ${formatMoves(moves.slice(0, k))} and ends by undoing it with ${formatMoves(
        moves.slice(n - k),
      )}. The middle ${formatMoves(moves.slice(k, n - k))} is the part that does the work.`,
    });
  }

  // Which hand: counts of right-side and left-side turns
  const r = moves.filter((m) => 'Rr'.includes(m.base)).length;
  const l = moves.filter((m) => 'Ll'.includes(m.base)).length;
  const u = moves.filter((m) => m.base === 'U').length;
  if (r + l + u > 0 && n >= 4) {
    const side = r > 0 && l === 0 ? 'right hand' : l > 0 && r === 0 ? 'left hand' : 'both hands';
    out.push({
      title: 'Fingertricks',
      text: `Mostly ${side}${u ? ', with the top turned by your index finger' : ''}. Keep the cube still and let the fingers do the turns.`,
    });
  }
  return out;
}
