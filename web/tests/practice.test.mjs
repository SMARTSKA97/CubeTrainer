// Run: node --import ./tests/register.mjs tests/practice.test.mjs
import assert from 'node:assert/strict';
import {
  pushSample,
  meanMs,
  shouldRepeatSoon,
  takeRepeat,
  enqueue,
  hintThresholdMs,
  hintStep,
} from '../src/app/domain/practice.ts';
import { computeBadges, longestStreak, weeklyRecap } from '../src/app/domain/badges.ts';
import { algSolvesCase } from '../src/app/domain/alg-check.ts';

let passed = 0;
const t = (name, fn) => {
  fn();
  passed++;
  console.log('ok  -', name);
};

t('samples keep the latest 20 and average', () => {
  let l = [];
  for (let i = 1; i <= 25; i++) l = pushSample(l, i * 100);
  assert.equal(l.length, 20);
  assert.equal(l[0], 600);
  assert.equal(meanMs([1000, 2000, 3000]), 2000);
  assert.equal(meanMs([]), null);
});

t('slow or failed solves come back soon', () => {
  assert.equal(shouldRepeatSoon(null, null, 0), true);
  assert.equal(shouldRepeatSoon(5000, 4000, 5), false);
  assert.equal(shouldRepeatSoon(6000, 4000, 5), true);
  assert.equal(shouldRepeatSoon(9000, 4000, 1), false); // not enough history to judge
});

t('repeat queue waits, then returns the case once, never straight after itself', () => {
  let q = enqueue([], 'a', 2);
  let r = takeRepeat(q, 'x');
  assert.equal(r.id, null);
  r = takeRepeat(r.queue, 'a');
  assert.equal(r.id, null); // due, but it was just shown
  r = takeRepeat(r.queue, 'b');
  assert.equal(r.id, 'a');
  assert.equal(r.queue.length, 0);
  assert.equal(enqueue(enqueue([], 'a'), 'a').length, 1);
});

t('hints appear late and then step', () => {
  assert.equal(hintThresholdMs(null), 8000);
  assert.equal(hintThresholdMs(2000), 6000);
  assert.equal(hintThresholdMs(10000), 16000);
  assert.equal(hintStep(5000, 8000), 0);
  assert.equal(hintStep(8000, 8000), 1);
  assert.equal(hintStep(12500, 8000), 2);
});

t('badges: counters and speed', () => {
  const base = {
    totalSolves: 0,
    caseSolves: 0,
    streak: 0,
    longestStreak: 0,
    finishedCases: 0,
    practiceDays: 0,
    bestSingleMs: null,
  };
  assert.equal(computeBadges(base).filter((b) => b.earned).length, 0);
  const b = computeBadges({ ...base, totalSolves: 120, longestStreak: 7, bestSingleMs: 25000 });
  const by = Object.fromEntries(b.map((x) => [x.id, x]));
  assert.ok(by.first.earned && by.s100.earned && !by.s500.earned);
  assert.ok(by.streak7.earned && !by.streak30.earned);
  assert.ok(by.sub60.earned && by.sub30.earned && !by.sub20.earned);
  assert.equal(by.s500.progress, 120 / 500);
});

t('longest streak and weekly recap', () => {
  const day = 86400000;
  const at = (d) => ({ at: d * day + 3600000, timeMs: 10000, penalty: 'none' });
  assert.equal(longestStreak([at(1), at(2), at(3), at(10), at(11)]), 3);
  assert.equal(longestStreak([]), 0);
  const solves = [
    at(100),
    at(101),
    { ...at(101), timeMs: 8000 },
    { ...at(101), penalty: 'dnf' },
    at(94),
  ];
  const r = weeklyRecap(solves, 101 * day + 7200000);
  assert.equal(r.solves, 4);
  assert.equal(r.previous, 1);
  assert.equal(r.days, 2);
  assert.equal(r.bestMs, 8000);
});

t('custom algorithm check', () => {
  const sune = "R U R' U R U2 R'";
  assert.equal(algSolvesCase(sune, sune).ok, true);
  assert.equal(algSolvesCase(sune, "R U R' U R U2 R' x").ok, true); // whole-cube turn at the end is fine
  assert.equal(algSolvesCase(sune, "R U R' U R U R'").ok, false);
  assert.equal(algSolvesCase(sune, 'R Q').ok, false);
  assert.equal(algSolvesCase(sune, '').ok, false);
  // a real alternative: Sune written with a wide move
  assert.equal(algSolvesCase("R U R' U R U2 R'", "R U R' U R U2 R'").alg, "R U R' U R U2 R'");
});

console.log(`${passed} passed`);
