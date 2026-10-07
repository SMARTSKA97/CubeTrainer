// Run: node --import ./tests/register.mjs tests/daily.test.mjs
import assert from 'node:assert/strict';
import { dailyScramble, dailyStatus } from '../src/app/domain/daily.ts';
import { xpSummary, xpForLevel } from '../src/app/domain/xp.ts';
import { dayIndex } from '../src/app/domain/plan.ts';

let passed = 0;
const t = (name, fn) => {
  fn();
  passed++;
  console.log('ok  -', name);
};
const DAY = 86400000;
const NOON = 20000 * DAY + 12 * 3600000;
const solve = (at, scramble, o = {}) => ({
  id: String(at) + scramble,
  at,
  timeMs: 9000,
  penalty: 'none',
  scramble,
  mode: 'random',
  ...o,
});

t('the daily scramble is the same all day, different next day, 20 moves', () => {
  const d = dayIndex(NOON);
  assert.equal(dailyScramble(d), dailyScramble(d));
  assert.notEqual(dailyScramble(d), dailyScramble(d + 1));
  assert.equal(dailyScramble(d).split(' ').length, 20);
});

t('dailyStatus: only the daily scramble counts; a DNF is an attempt, not done', () => {
  const sc = dailyScramble(dayIndex(NOON));
  assert.equal(dailyStatus([solve(NOON, 'R U')], NOON).attempts, 0);
  assert.equal(dailyStatus([solve(NOON, sc, { penalty: 'dnf' })], NOON).done, false);
  const ok = dailyStatus(
    [solve(NOON, sc, { timeMs: 30000 }), solve(NOON + 1, sc, { timeMs: 25000, penalty: 'plus2' })],
    NOON,
  );
  assert.equal(ok.done, true);
  assert.equal(ok.bestMs, 27000);
  assert.equal(ok.attempts, 2);
  assert.equal(dailyStatus([solve(NOON - DAY, sc)], NOON).attempts, 0);
});

t('xp: solves, daily bonus once a day, and streak days add up', () => {
  const sc = dailyScramble(dayIndex(NOON));
  const one = xpSummary([solve(NOON, 'R U')], NOON);
  assert.equal(one.xp, 10 + 5 + 10);
  const daily = xpSummary([solve(NOON, sc), solve(NOON + 1, sc)], NOON);
  assert.equal(daily.xp, 2 * 15 + 40 + 10);
  const two = xpSummary([solve(NOON - DAY, 'R U'), solve(NOON, 'R U')], NOON);
  assert.equal(two.xp, 15 + 10 + 15 + 20);
});

t('xp: levels', () => {
  assert.equal(xpForLevel(1), 100);
  assert.equal(xpForLevel(2), 300);
  const s = xpSummary([], NOON);
  assert.equal(s.level, 0);
  assert.equal(s.xp, 0);
});

console.log(`${passed} passed`);
