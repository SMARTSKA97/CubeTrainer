import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Cube, randomScramble } from '../src/app/domain/cube.ts';
import { stageOf, easiestPair, recogniseLl, aufFinish, crossFrom } from '../src/app/domain/coach.ts';

const algs = JSON.parse(readFileSync(new URL('../../data/algs.json', import.meta.url))).cases;
let seed = 7;
const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

test('a solved cube is solved and a scramble starts at the cross', () => {
  assert.equal(stageOf(new Cube()), 'done');
  assert.equal(stageOf(new Cube().apply(randomScramble(20, rng))), 'cross');
});

test('the coach can take any scramble all the way to solved, stage by stage', () => {
  for (let n = 0; n < 15; n++) {
    const scr = randomScramble(20, rng);
    let cube = new Cube().apply(scr);
    let moves = scr;
    const seen = [];
    for (let guard = 0; guard < 80 && stageOf(cube) !== 'done'; guard++) {
      const st = stageOf(cube);
      if (seen[seen.length - 1] !== st) seen.push(st);
      let step;
      if (st === 'cross') step = crossFrom(moves);
      else if (st === 'f2l') {
        const t0 = Date.now();
        const p = easiestPair(cube);
        assert.ok(p, 'pair found for ' + moves);
        step = p.moves;
      } else if (st === 'auf') step = (aufFinish(cube) ?? '').split(' ');
      else {
        const k = recogniseLl(cube, st, algs);
        assert.ok(k, st + ' recognised');
        step = [...(k.pre ? [['', 'U', 'U2', "U'"][k.pre]] : []), k.alg];
      }
      cube = cube.apply(step.join(' '));
      moves += ' ' + step.join(' ');
    }
    assert.equal(stageOf(cube), 'done', seen.join('>'));
  }
});
