// Run: node --import ./tests/register.mjs tests/learn.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyRecall,
  introduce,
  isDue,
  recallState,
  dueRecalls,
  chunkAlg,
  introducedToday,
  RECALL_DAYS,
} from '../src/app/domain/memory.ts';
import {
  placeLevel,
  levelCheck,
  averageOfFive,
  activeBatch,
  batchesOf,
  stepProgress,
  currentStep,
  LEVELS,
} from '../src/app/domain/levels.ts';
import { algSolvesCase } from '../src/app/domain/alg-check.ts';

let passed = 0;
const t = (name, fn) => {
  fn();
  passed++;
  console.log('ok  -', name);
};
const DAY = 86400000;
const NOW = 20000 * DAY + 12 * 3600000;

t('first pass puts the next check one day away', () => {
  const m = applyRecall(introduce(NOW), true, NOW);
  assert.equal(m.passes, 1);
  assert.equal(m.nextAt, NOW + DAY * RECALL_DAYS[0]);
  assert.equal(recallState(m), 'recalled');
  assert.equal(isDue(m, NOW), false);
  assert.equal(isDue(m, NOW + 2 * DAY), true);
});
t('a due success moves up a box; an early success does not', () => {
  let m = applyRecall(introduce(NOW), true, NOW);
  m = applyRecall(m, true, NOW + 2 * DAY);
  assert.equal(m.box, 1);
  const early = applyRecall(m, true, NOW + 2 * DAY + 1000);
  assert.equal(early.box, 1);
  assert.equal(early.nextAt, m.nextAt);
});
t('a lapse drops two boxes and makes it due now', () => {
  let m = introduce(NOW);
  for (let i = 0; i < 5; i++) m = applyRecall(m, true, m.nextAt || NOW);
  assert.equal(recallState(m), 'solid');
  const f = applyRecall(m, false, NOW + 100 * DAY);
  assert.equal(f.box, Math.max(0, m.box - 2));
  assert.equal(isDue(f, NOW + 100 * DAY), true);
  assert.equal(f.lapses, 1);
});
t('failing a never-recalled case stays "seen" and not due', () => {
  const f = applyRecall(introduce(NOW), false, NOW);
  assert.equal(recallState(f), 'seen');
  assert.equal(isDue(f, NOW + 5 * DAY), false);
});
t('due recalls are listed oldest first and cases introduced today are counted', () => {
  const a = applyRecall(introduce(NOW - 10 * DAY), true, NOW - 10 * DAY);
  const b = applyRecall(introduce(NOW - 5 * DAY), true, NOW - 5 * DAY);
  const c = introduce(NOW);
  assert.deepEqual(dueRecalls({ a, b, c }, NOW), ['a', 'b']);
  assert.equal(introducedToday({ a, b, c }, NOW, 0), 1);
});
t('placement thresholds', () => {
  assert.equal(placeLevel(null), 'beginner');
  assert.equal(placeLevel(200000), 'beginner');
  assert.equal(placeLevel(60000), 'intermediate');
  assert.equal(placeLevel(25000), 'advanced');
});
const solve = (i, ms, extra = {}) => ({
  id: 's' + i,
  at: NOW + i * 1000,
  timeMs: ms,
  penalty: 'none',
  scramble: 'R U',
  mode: 'random',
  ...extra,
});
t('average of five drops best and worst, a DNF is the worst', () => {
  const s = [10, 20, 30, 40, 50].map((x, i) => solve(i, x * 1000));
  assert.equal(averageOfFive(s), 30000);
  s[4] = solve(4, 1000, { penalty: 'dnf' });
  assert.equal(averageOfFive(s), 30000);
  assert.equal(averageOfFive(s.slice(0, 4)), null);
});
t('level check promotes, demotes and stays with room between', () => {
  const fast = [0, 1, 2, 3, 4].map((i) => solve(i, 50000));
  assert.equal(levelCheck('beginner', fast).action, 'promote');
  assert.equal(levelCheck('beginner', fast).to, 'intermediate');
  assert.equal(levelCheck('intermediate', fast).action, 'stay');
  const slow = [0, 1, 2, 3, 4].map((i) => solve(i, 150000));
  assert.equal(levelCheck('intermediate', slow).to, 'beginner');
  const sub = [0, 1, 2, 3, 4].map((i) => solve(i, 20000));
  assert.equal(levelCheck('intermediate', sub).to, 'advanced');
  assert.equal(levelCheck('advanced', [0, 1, 2, 3, 4].map((i) => solve(i, 50000))).to, 'intermediate');
  assert.equal(levelCheck('beginner', fast, NOW + 10 * DAY).action, 'stay');
});
t('batches and the active batch', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(batchesOf(ids), [['a', 'b', 'c'], ['d', 'e']]);
  const rec = (id) => ({ [id]: applyRecall(introduce(NOW), true, NOW) });
  assert.deepEqual(activeBatch(ids, {}), ['a', 'b', 'c']);
  assert.deepEqual(activeBatch(ids, { ...rec('a'), ...rec('b'), ...rec('c') }), ['d', 'e']);
  assert.deepEqual(activeBatch(ids, { ...rec('a'), ...rec('b'), ...rec('c'), ...rec('d'), ...rec('e') }), []);
});
t('step progress and the current step', () => {
  const lvl = LEVELS.beginner;
  const ids = (st) => st.ids ?? [];
  const inp = (o = {}) => ({ caseIds: ids, memory: {}, status: {}, stepsDone: [], solves: [], sinceMs: 0, ...o });
  const rows = (i) => lvl.steps.map((s) => stepProgress(s, i));
  assert.equal(currentStep(rows(inp())).step.id, 'b-basics');
  const done = lvl.steps.filter((s) => s.kind === 'lesson').map((s) => s.id);
  const mem = {};
  for (const s of lvl.steps) for (const id of s.ids ?? []) mem[id] = applyRecall(introduce(NOW), true, NOW);
  assert.equal(currentStep(rows(inp({ stepsDone: done, memory: mem }))).step.id, 'b-solve');
  const solves = [0, 1, 2].map((i) => solve(i, 100000));
  assert.equal(currentStep(rows(inp({ stepsDone: done, memory: mem, solves }))), null);
});
t('every algorithm in the data can be recalled (accepts itself, rejects a truncated version)', () => {
  const data = JSON.parse(readFileSync(new URL('../../data/algs.json', import.meta.url), 'utf8'));
  const bad = [];
  for (const c of data.cases) {
    const r = algSolvesCase(c.alg, c.alg);
    if (!r.ok) bad.push(c.id + ': ' + r.error);
  }
  assert.deepEqual(bad, []);
  assert.equal(algSolvesCase("R U R' U'", "R U R'").ok, false);
});
t('chunks keep brackets and name triggers', () => {
  assert.deepEqual(chunkAlg("R U R' U' F R"), [
    { moves: "R U R' U'", hook: 'sexy move' },
    { moves: 'F R' },
  ]);
  assert.deepEqual(chunkAlg("U2 (R U R') U (R U' R')").map((c) => c.moves), ['U2', "R U R'", 'U', "R U' R'"]);
});
console.log(passed + ' passed');
