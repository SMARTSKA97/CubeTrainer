// Run: node --import ./tests/register.mjs tests/solve-filter.test.mjs
import assert from 'node:assert/strict';
import { facets, filterSolves, isActive } from '../src/app/domain/solve-filter.ts';
import { fromRemote } from '../src/app/core/data/sync-logic.ts';

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('ok  -', name);
};
const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const s = (id, daysAgo, cube, method) => ({
  id,
  at: NOW - daysAgo * DAY,
  timeMs: 10000,
  penalty: 'none',
  scramble: 'R U',
  mode: 'random',
  ...(cube ? { cube } : {}),
  ...(method ? { method } : {}),
});
const list = [
  s('a', 40, 'GAN 13', 'cfop'),
  s('b', 5, 'gan 13', 'cfop'),
  s('c', 2, 'Moyu', 'roux'),
  s('d', 1),
];
const ids = (r) => r.map((x) => x.id).join('');

t('an empty filter keeps everything', () => {
  assert.equal(isActive({}), false);
  assert.equal(ids(filterSolves(list, {}, NOW)), 'abcd');
});
t('period keeps only recent solves', () => {
  assert.equal(ids(filterSolves(list, { days: 7 }, NOW)), 'bcd');
  assert.equal(ids(filterSolves(list, { days: 3 }, NOW)), 'cd');
});
t('cube and method match case-insensitively; unlabeled solves drop out', () => {
  assert.equal(ids(filterSolves(list, { cube: 'GAN 13' }, NOW)), 'ab');
  assert.equal(ids(filterSolves(list, { method: 'ROUX' }, NOW)), 'c');
  assert.equal(ids(filterSolves(list, { cube: 'GAN 13', days: 7 }, NOW)), 'b');
});
t('facets list what exists, most used first, one spelling per label', () => {
  assert.deepEqual(facets(list), { cubes: ['GAN 13', 'Moyu'], methods: ['cfop', 'roux'] });
});
t('cube and method survive a sync round trip', () => {
  const r = fromRemote({ ...s('x', 0, 'GAN 13', 'cfop'), rev: 1, deleted: false });
  assert.equal(r.cube, 'GAN 13');
  assert.equal(r.method, 'cfop');
  assert.equal('cube' in fromRemote({ ...s('y', 0), cube: null, rev: 2, deleted: false }), false);
});
console.log(`\n${n} passed`);
