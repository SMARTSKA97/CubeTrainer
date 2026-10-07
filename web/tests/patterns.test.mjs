// Run: node --import ./tests/register.mjs tests/patterns.test.mjs
import assert from 'node:assert/strict';
import { Cube, parseMoves, moveSpec, describeMove, stateAfter } from '../src/app/domain/cube.ts';
import { chunkAlg, insightsFor } from '../src/app/domain/patterns.ts';

let passed = 0;
const t = (name, fn) => {
  fn();
  passed++;
  console.log('ok  -', name);
};

// A turn drawn from moveSpec (rotate the cubies in the layer about the axis) must equal Cube.applyMove.
function rot(v, axis, q) {
  let [x, y, z] = v;
  const n = ((q % 4) + 4) % 4;
  for (let i = 0; i < n; i++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [z, x] = [-x, z];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}
const key = (c) =>
  c.stickers.map((s) => `${s.p}|${s.n}|${s.c}`).sort().join(';');

t('moveSpec turns the same cubies as applyMove, for every move', () => {
  for (const b of 'URFDLBurfdlbMESxyz') {
    for (const suf of ['', "'", '2']) {
      const m = parseMoves(b + suf)[0];
      const viaApply = stateAfter('R U2 F D').applyMove(m) ?? null;
      const a = stateAfter("R U2 F D' L B2");
      const spec = moveSpec(m);
      const manual = a.clone();
      for (const s of manual.stickers) {
        if (!spec.inLayer(s.p)) continue;
        s.p = rot(s.p, spec.axis, spec.quarter);
        s.n = rot(s.n, spec.axis, spec.quarter);
      }
      a.applyMove(m);
      assert.equal(key(manual), key(a), `move ${b}${suf}`);
      void viaApply;
    }
  }
});

t('chunks cover every move exactly once, in order', () => {
  for (const alg of [
    "R U R' U R U2 R'",
    "F R U R' U' F'",
    "R U R' U' R U R' U' R U R' U'",
    "r U R' U' r' F R F'",
    "R' U' R U' R' U2 R",
    "F R' F' R U R U' R'",
  ]) {
    const moves = parseMoves(alg);
    const chunks = chunkAlg(moves);
    let at = 0;
    for (const c of chunks) {
      assert.equal(c.from, at);
      assert.ok(c.to > c.from);
      at = c.to;
    }
    assert.equal(at, moves.length, alg);
  }
});

t('named blocks are found', () => {
  assert.equal(chunkAlg(parseMoves("R U R' U R U2 R'"))[0].name, 'Sune');
  assert.equal(chunkAlg(parseMoves("F R U R' U' F'"))[0].name, 'Edge flip: F, sexy, F′');
  const rep = chunkAlg(parseMoves("R U R' U' R U R' U' R U R' U'"));
  assert.equal(rep.length, 1);
  assert.equal(rep[0].repeat, 3);
});

t('insights: commutator and setup/undo', () => {
  assert.ok(insightsFor(parseMoves("R U R' U'")).some((i) => i.title === 'Commutator shape'));
  assert.ok(insightsFor(parseMoves("F R U R' U' F'")).some((i) => i.title === 'Setup and undo'));
});

t('describeMove reads naturally', () => {
  assert.match(describeMove(parseMoves("R'")[0]), /Right face counter-clockwise/);
  assert.match(describeMove(parseMoves('U2')[0]), /half turn/);
});

console.log(`${passed} passed`);
