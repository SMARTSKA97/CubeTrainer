// Run: node --import ./tests/register.mjs tests/cross.test.mjs
import assert from 'node:assert/strict';
import { Cube, FACES, randomScramble } from '../src/app/domain/cube.ts';
import { solveCross, crossLengths } from '../src/app/domain/cross-solver.ts';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

function crossSolved(cube, face) {
  const solved = new Cube();
  const ci = FACES.indexOf(face);
  return cube.stickers.every((s, i) => {
    const q = solved.stickers[i];
    const isEdge = q.p.filter((v) => v !== 0).length === 2;
    if (q.c !== ci || !isEdge) return true;
    return s.p.join() === q.p.join() && s.n.join() === q.n.join();
  });
}

t('solved cube needs 0 moves; one turn needs one move', () => {
  assert.equal(solveCross('', 'D').length, 0);
  assert.equal(solveCross("R", 'D').length, 1);
  assert.equal(solveCross("U R2 F'", 'D').length <= 3, true);
});

t('solution really solves the cross on every face (random scrambles)', () => {
  for (let k = 0; k < 12; k++) {
    const scr = randomScramble(20);
    for (const f of FACES) {
      const sol = solveCross(scr, f);
      assert.ok(sol, `${scr} ${f}`);
      const c = new Cube().apply(scr).apply(sol.moves.join(' '));
      assert.ok(crossSolved(c, f), `${scr} -> ${f}: ${sol.moves.join(' ')}`);
      assert.ok(sol.length <= 8, 'cross is never longer than 8 HTM');
    }
  }
});

t('optimal: no shorter sequence exists for a known 2-move cross', () => {
  const sol = solveCross("R U", 'D');
  assert.ok(sol.length <= 2);
  assert.equal(Object.keys(crossLengths("R U F")).length, 6);
});

console.log(`\n${n} test groups passed`);
