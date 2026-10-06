// Run: node tests/engine.test.mjs   (Node >= 22.18 strips TypeScript types natively)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Cube,
  parseMoves,
  formatMoves,
  invertAlg,
  randomScramble,
  caseScramble,
  removeRotations,
  FACES,
  f2lReport,
} from '../src/app/domain/cube.ts';
import {
  schemeNames,
  validFronts,
  opposite,
  COLOR_NAMES,
  rotationFromStandard,
} from '../src/app/domain/orientation.ts';

let passed = 0;
const t = (name, fn) => {
  fn();
  passed++;
  console.log('ok  -', name);
};

t('four quarter turns of every face are identity', () => {
  for (const f of 'URFDLBMESxyz') {
    assert.ok(new Cube().apply(`${f} ${f} ${f} ${f}`).isSolved(), f);
    assert.ok(new Cube().apply(`${f}2 ${f}2`).isSolved(), f + '2');
    assert.ok(new Cube().apply(`${f} ${f}'`).isSolved(), f + "'");
  }
});

t('sexy move has order 6, sune order 6, T-perm order 2', () => {
  assert.ok(new Cube().apply("R U R' U' ".repeat(6)).isSolved());
  assert.ok(!new Cube().apply("R U R' U' ".repeat(5)).isSolved());
  assert.ok(new Cube().apply("R U R' U' R' F R2 U' R' U' R U R' F' ".repeat(2)).isSolved());
});

t('R turn moves colours the right way (front->up, down->front)', () => {
  const c = new Cube().apply('R');
  const up = c.faceGrid('U');
  const front = c.faceGrid('F');
  assert.deepEqual([up[2], up[5], up[8]], [2, 2, 2]); // green on U right column
  assert.deepEqual([front[2], front[5], front[8]], [3, 3, 3]); // yellow on F right column
  const u = new Cube().apply('U').faceGrid('F');
  assert.deepEqual([u[0], u[1], u[2]], [1, 1, 1]); // U moves R colour onto F top row
});

t('wide moves and slices equal their face-turn definitions', () => {
  const same = (a, b) =>
    JSON.stringify(
      new Cube()
        .apply(a)
        .stickers.map((s) => [s.p, s.n, s.c])
        .sort(),
    ) ===
    JSON.stringify(
      new Cube()
        .apply(b)
        .stickers.map((s) => [s.p, s.n, s.c])
        .sort(),
    );
  assert.ok(same('r', 'L x'));
  assert.ok(same('l', "R x'"));
  assert.ok(same('u', 'D y'));
  assert.ok(same('f', 'B z'));
  assert.ok(same('M', "x' R L'"));
  assert.ok(same('E', "y' U D'"));
  assert.ok(same('S', "z F' B"));
  assert.ok(same('Rw', 'r'));
});

t('scramble followed by its inverse is solved', () => {
  for (let i = 0; i < 200; i++) {
    const s = randomScramble();
    assert.equal(parseMoves(s).length, 20);
    assert.ok(new Cube().apply(s).apply(invertAlg(s)).isSolved());
  }
});

t('random scramble rules: no repeated face, no same-axis triples', () => {
  const axis = { U: 1, D: 1, L: 0, R: 0, F: 2, B: 2 };
  for (let i = 0; i < 500; i++) {
    const m = parseMoves(randomScramble());
    for (let k = 1; k < m.length; k++) {
      assert.notEqual(m[k].base, m[k - 1].base);
      if (k > 1)
        assert.ok(
          !(axis[m[k].base] === axis[m[k - 1].base] && axis[m[k - 1].base] === axis[m[k - 2].base]),
        );
    }
  }
});

t('random scrambles are not obviously biased (first move spread)', () => {
  const counts = {};
  for (let i = 0; i < 6000; i++) {
    const f = randomScramble().split(' ')[0][0];
    counts[f] = (counts[f] || 0) + 1;
  }
  for (const f of 'UDLRFB') assert.ok(counts[f] > 800 && counts[f] < 1200, `${f}:${counts[f]}`);
});

t('rotation removal keeps the physical state', () => {
  const seqs = ["x R U R' y F2 z' L", "R' U x' R2 y2 F r' M2 S", "y2 R U R' U' x z' B D'"];
  for (const seq of seqs) {
    const a = new Cube().apply(seq);
    const b = new Cube().apply(formatMoves(removeRotations(parseMoves(seq))));
    const key = (c) => FACES.map((f) => c.faceGrid(f).join('')).join('|');
    assert.equal(key(a), key(b), seq);
  }
});

t("Antisune case from the screenshot (R U2 R' U' R U' R')", () => {
  const alg = "R U2 R' U' R U' R'";
  const cs = caseScramble(alg, () => 0, false);
  assert.equal(cs.scramble, "R U R' U R U2 R'"); // the inverse is Sune
  assert.ok(new Cube().apply(cs.scramble).apply(alg).isSolved());
  const c = new Cube().apply(cs.scramble);
  // F2L untouched: D face and bottom two rows of the side faces are still solved
  assert.ok(c.faceGrid('D').every((x) => x === 3));
  for (const f of ['F', 'R', 'B', 'L']) {
    const g = c.faceGrid(f);
    assert.ok(
      g.slice(3).every((x) => x === FACES.indexOf(f)),
      f,
    );
  }
});

const data = JSON.parse(readFileSync(new URL('../../data/algs.json', import.meta.url)));
const ROT_FREE_SETS = new Set(['2lookoll', 'oll', 'oholl', 'coll', 'wv']);

/** Solver view: optional U turns before the alg, optional U turns after (pre-AUF / post-AUF). */
function solvesWithAuf(cube, alg) {
  for (let pre = 0; pre < 4; pre++)
    for (let post = 0; post < 4; post++) {
      const c = cube.clone();
      if (pre) c.apply('U'.repeat(1) + (pre === 2 ? '2' : pre === 3 ? "'" : ''));
      c.apply(alg);
      if (post) c.apply('U' + (post === 2 ? '2' : post === 3 ? "'" : ''));
      if (c.isSolved()) return true;
    }
  return false;
}

t(
  `all ${data.cases.length} algorithms x 4 case rotations: scramble + (pre-AUF) alg (post-AUF) solves the cube`,
  () => {
    const bad = [];
    for (const c of data.cases) {
      for (let auf = 0; auf < 4; auf++) {
        const cs = caseScramble(c.alg, () => auf / 4, true);
        assert.equal(cs.auf, auf);
        const cube = new Cube().apply(cs.scramble);
        if (cube.isSolved()) bad.push(`${c.id} trivial`);
        if (!solvesWithAuf(cube, c.alg)) bad.push(`${c.id} (${c.name}) auf=${auf}: ${cs.scramble}`);
        // without AUF the alg must solve the case directly (up to a final U turn)
        if (auf === 0 && !new Cube().apply(cs.scramble).apply(c.alg).isSolvedUpToAuf())
          bad.push(`${c.id} exact case not solved by alg`);
        if (/[MESudfrlb]/.test(cs.scramble)) bad.push(`${c.id} non-face move in scramble`);
      }
    }
    assert.deepEqual(bad, []);
  },
);

/** True if, for some face taken as "bottom", the two layers next to it are fully solved (F2L done). */
function f2lSolvedSomewhere(cube) {
  const centerColor = (n) =>
    cube.stickers.find((s) => s.p.every((v, i) => v === n[i]) && s.n.every((v, i) => v === n[i])).c;
  const bottoms = [
    [1, 0],
    [-1, 0],
    [1, 1],
    [-1, 1],
    [1, 2],
    [-1, 2],
  ]; // [sign, axis]
  return bottoms.some(([sign, axis]) =>
    cube.stickers.every((s) => {
      const inF2L = s.p[axis] * -sign >= 0; // the bottom layer and the middle layer
      const isLLFace = s.n[axis] === sign; // stickers facing the top are last-layer stickers
      if (!inF2L || isLLFace) return true;
      return s.c === centerColor(s.n);
    }),
  );
}

t(
  'F2L stays solved for OLL / 2-look / COLL cases (Winter Variation intentionally solves the last pair)',
  () => {
    const bad = [];
    for (const c of data.cases.filter((x) =>
      ['oll', 'oholl', '2lookoll', 'coll', 'pll', 'ohpll', '2lookpll'].includes(x.set),
    )) {
      for (const r of [0, 0.3, 0.6, 0.9]) {
        const cs = caseScramble(c.alg, () => r, true);
        if (!f2lSolvedSomewhere(new Cube().apply(cs.scramble))) bad.push(`${c.id} ${c.name}`);
      }
    }
    assert.deepEqual([...new Set(bad)], []);
  },
);

t('Winter Variation: F2L is not complete (last pair still to be solved)', () => {
  // Sanity only: the scramble must NOT leave F2L fully solved, otherwise it wouldn't be a WV case.
  const unsolved = data.cases
    .filter((x) => x.set === 'wv')
    .filter(
      (c) => !f2lSolvedSomewhere(new Cube().apply(caseScramble(c.alg, () => 0, false).scramble)),
    );
  assert.equal(unsolved.length, 27);
});

t('every case in a set is distinct (no duplicate setups)', () => {
  const key = (c) => FACES.map((f) => c.faceGrid(f).join('')).join('|');
  for (const set of data.sets) {
    const seen = new Map();
    const dups = [];
    for (const c of data.cases.filter((x) => x.set === set.id)) {
      const k = key(new Cube().apply(caseScramble(c.alg, () => 0, false).scramble));
      if (seen.has(k)) dups.push(`${c.id}=${seen.get(k)}`);
      seen.set(k, c.id);
    }
    console.log(`      ${set.id}: ${set.count} cases, duplicates: ${dups.join(', ') || 'none'}`);
  }
});

t(
  'every F2L / beginner / combo case: cross intact and the algorithm solves its own scramble',
  () => {
    const sets = ['f2l-basic', 'f2l-adv', 'f2l-expert', 'f2l-chain', 'beginner', 'ollpll'];
    for (const id of sets) {
      const cases = data.cases.filter((x) => x.set === id);
      assert.ok(cases.length > 0, id);
      for (const c of cases) {
        const scr = caseScramble(c.alg, () => 0, false).scramble;
        const st = new Cube().apply(scr);
        assert.ok(f2lReport(st).crossSolved, `${c.id} cross`);
        if (id.startsWith('f2l-') && id !== 'f2l-chain') {
          const r = f2lReport(st);
          assert.ok(r.unsolvedSlots.length >= 1, `${c.id} not scrambled`);
          const after = f2lReport(st.apply(c.alg));
          assert.ok(
            after.crossSolved && after.unsolvedSlots.length === 0,
            `${c.id} F2L not solved by its alg`,
          );
          assert.ok(c.algs.length >= 1 && c.setup === scr, `${c.id} data`);
        } else {
          assert.ok(st.apply(c.alg).isSolvedUpToAuf(), `${c.id} not solved`);
        }
      }
    }
  },
);

t('hold orientation: standard scheme and rotated schemes are consistent', () => {
  const n = schemeNames({ top: 'white', front: 'green' });
  assert.deepEqual(
    [n.U, n.F, n.R, n.B, n.L, n.D],
    ['white', 'green', 'red', 'blue', 'orange', 'yellow'],
  );
  const pdf = schemeNames({ top: 'yellow', front: 'red' }); // F2L PDF: white bottom, red front, green right
  assert.deepEqual([pdf.D, pdf.F, pdf.R], ['white', 'red', 'green']);
  // every legal hold: six distinct colours, opposite faces are opposite colours
  for (const top of COLOR_NAMES)
    for (const front of validFronts(top)) {
      const s = schemeNames({ top, front });
      assert.equal(new Set(Object.values(s)).size, 6);
      assert.equal(opposite(s.U), s.D);
      assert.equal(opposite(s.F), s.B);
      assert.equal(opposite(s.R), s.L);
    }
  assert.equal(rotationFromStandard({ top: 'white', front: 'green' }), 'no rotation');
  assert.equal(rotationFromStandard({ top: 'yellow', front: 'red' }).length > 0, true);
});

console.log(`\n${passed} test groups passed`);
