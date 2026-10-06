import type { Face } from './cube';

const FACE_LIST: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/**
 * How to hold a SOLVED cube before applying a scramble.
 *
 * A scramble such as "R U R' F" only talks about the faces (top / front / right ...). Which colours
 * those faces carry depends on how the solved cube is held, so the app tells the user: "top = white,
 * front = green". Everything is derived from the standard (WCA) colour scheme by rotating it.
 */
export type ColorName = 'white' | 'yellow' | 'green' | 'blue' | 'red' | 'orange';

export const COLOR_HEX: Record<ColorName, string> = {
  white: '#f5f5f5',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  red: '#ef4444',
  orange: '#fb923c',
};

export const COLOR_NAMES = Object.keys(COLOR_HEX) as ColorName[];

type V = [number, number, number];

/** Standard scheme as direction vectors (x = right, y = up, z = front): white up, green front, red right. */
const STD: Record<ColorName, V> = {
  white: [0, 1, 0],
  yellow: [0, -1, 0],
  green: [0, 0, 1],
  blue: [0, 0, -1],
  red: [1, 0, 0],
  orange: [-1, 0, 0],
};

export interface Hold {
  top: ColorName;
  front: ColorName;
}

/** WCA standard: white top, green front. */
export const STANDARD_HOLD: Hold = { top: 'white', front: 'green' };
/** Cross colour white on the bottom, red in front: matches the pictures of the F2L PDF (green on the right). */
export const CROSS_WHITE_HOLD: Hold = { top: 'yellow', front: 'red' };

const same = (a: V, b: V) => a.every((v, i) => v === b[i]);
const neg = (a: V): V => [-a[0], -a[1], -a[2]];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const colorOf = (v: V): ColorName => COLOR_NAMES.find((c) => same(STD[c], v))!;

export function opposite(c: ColorName): ColorName {
  return colorOf(neg(STD[c]));
}

/** Colours that can be in front when `top` is on top (the four side colours). */
export function validFronts(top: ColorName): ColorName[] {
  return COLOR_NAMES.filter((c) => c !== top && c !== opposite(top));
}

/** Make a hold valid: if front is on the same axis as top, pick the first valid front. */
export function normalizeHold(h: Hold): Hold {
  return validFronts(h.top).includes(h.front) ? h : { top: h.top, front: validFronts(h.top)[0] };
}

/** Colour of every face of the solved cube for this hold. */
export function schemeNames(h: Hold): Record<Face, ColorName> {
  const hold = normalizeHold(h);
  const right = colorOf(cross(STD[hold.top], STD[hold.front]));
  return {
    U: hold.top,
    D: opposite(hold.top),
    F: hold.front,
    B: opposite(hold.front),
    R: right,
    L: opposite(right),
  };
}

export function schemeHex(h: Hold): Record<Face, string> {
  const n = schemeNames(h);
  return Object.fromEntries(FACE_LIST.map((f) => [f, COLOR_HEX[n[f]]])) as Record<Face, string>;
}

/** e.g. "Hold the solved cube with white on top and green facing you (red on the right)." */
export function holdText(h: Hold): string {
  const n = schemeNames(h);
  return `Hold the solved cube with ${n.U} on top and ${n.F} facing you (${n.R} on the right).`;
}

/**
 * Whole-cube rotations (x, y, z) that bring a cube held the standard way (white top, green front)
 * into this hold. Handy when someone only wants to know "how do I turn my cube".
 */
export function rotationFromStandard(h: Hold): string {
  const hold = normalizeHold(h);
  const up = STD[hold.top];
  const fr = STD[hold.front];
  // search every sequence of up to 3 quarter turns for the one that moves white->top colour, green->front colour
  const rot = (v: V, axis: 'x' | 'y' | 'z'): V =>
    axis === 'x' ? [v[0], -v[2], v[1]] : axis === 'y' ? [v[2], v[1], -v[0]] : [-v[1], v[0], v[2]];
  const key = (u: V, f: V) => `${u}|${f}`;
  const seen = new Map<string, string>([[key([0, 1, 0], [0, 0, 1]), '']]);
  const queue: [V, V, string][] = [[[0, 1, 0], [0, 0, 1], '']];
  while (queue.length) {
    const [u, f, path] = queue.shift()!;
    if (same(u, up) && same(f, fr)) return path.trim() || 'no rotation';
    for (const ax of ['x', 'y', 'z'] as const) {
      const nu = rot(u, ax);
      const nf = rot(f, ax);
      const k = key(nu, nf);
      if (!seen.has(k)) {
        seen.set(k, path);
        queue.push([nu, nf, `${path} ${ax}`]);
      }
    }
  }
  return '';
}
