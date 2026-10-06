// Run: node --import ./tests/register.mjs tests/plan.test.mjs
import assert from 'node:assert/strict';
import {
  buildPlan,
  boxOf,
  planProgress,
  streakDays,
  INTERVAL_DAYS,
} from '../src/app/domain/plan.ts';

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('ok  -', name);
};
const DAY = 86400000;
const NOW = 1_800_000_000_000;
const sv = (cid, daysAgo, ms = 4000, k = 0) => ({
  id: `${cid}${daysAgo}${k}`,
  at: NOW - daysAgo * DAY - k * 1000,
  timeMs: ms,
  penalty: 'none',
  scramble: 's',
  mode: 'case',
  caseId: cid,
});
const T = () => 5000;
const mkInput = (cases, solves, statuses = {}, extra = {}) => ({
  cases,
  statuses,
  targetMs: T,
  activeSets: ['a'],
  now: NOW,
  solvesByCase: new Map(
    cases.map((c) => [c.id, solves.filter((s) => s.caseId === c.id).sort((x, y) => x.at - y.at)]),
  ),
  ...extra,
});
const cs = (...ids) => ids.map((id) => ({ id, set: 'a' }));

t('box: good days climb, a slow day drops two', () => {
  const good = [10, 9, 8, 7].map((d) => sv('x', d));
  assert.equal(boxOf(good, 5000), 4);
  assert.equal(boxOf([...good, sv('x', 6, 9000)], 5000), 2);
  assert.equal(boxOf([], 5000), 0);
  assert.deepEqual(INTERVAL_DAYS, [0, 1, 3, 7, 14, 30]);
});

t('plan: new cases are capped, nothing else due', () => {
  const p = buildPlan(mkInput(cs('1', '2', '3', '4', '5'), []));
  assert.equal(p.length, 3);
  assert.ok(p.every((i) => i.reason === 'new'));
});

t('plan: finished case reappears only when its interval has passed', () => {
  // good on 3 separate days -> box 3 -> 7 day interval
  const hist = [12, 11, 10].map((d) => sv('f', d));
  const resting = buildPlan(
    mkInput(
      cs('f'),
      [...hist, sv('f', 3)].slice(0, 3).map((s) => ({ ...s, at: s.at + 7 * DAY })),
      { f: 'finished' },
    ),
  );
  // last solve 3 days ago, interval 7 -> not due (cases: only 'f', no new)
  assert.equal(resting.length, 0);
  const due = buildPlan(mkInput(cs('f'), hist, { f: 'finished' }));
  assert.equal(due.length, 1);
  assert.equal(due[0].reason, 'due');
  assert.ok(due[0].overdueDays >= 0);
});

t('plan: learning case due the next day; solves today tick it off without removing it', () => {
  const yesterday = [sv('l', 1)];
  let p = buildPlan(mkInput(cs('l'), yesterday, { l: 'learning' }));
  assert.equal(p[0].reason, 'learning');
  assert.equal(p[0].done, 0);
  const withToday = [...yesterday, sv('l', 0, 4000, 1), sv('l', 0, 4000, 2)];
  p = buildPlan(mkInput(cs('l'), withToday, { l: 'learning' }));
  assert.equal(p[0].done, 2);
  assert.equal(planProgress(p).done, 2);
});

t('plan: only active sets; big learning backlog stops new cases', () => {
  const many = Array.from({ length: 9 }, (_, i) => `l${i}`);
  const solves = many.map((id) => sv(id, 2));
  const st = Object.fromEntries(many.map((id) => [id, 'learning']));
  const p = buildPlan(mkInput([...cs(...many), ...cs('new1')], solves, st));
  assert.ok(!p.some((i) => i.reason === 'new'));
  const other = buildPlan({ ...mkInput(cs('q'), []), activeSets: ['zzz'] });
  assert.equal(other.length, 0);
});

t('streak counts consecutive days, survives until you practise today', () => {
  assert.equal(streakDays([{ at: NOW }, { at: NOW - DAY }, { at: NOW - 2 * DAY }], NOW), 3);
  assert.equal(streakDays([{ at: NOW - DAY }, { at: NOW - 2 * DAY }], NOW), 2);
  assert.equal(streakDays([{ at: NOW - 3 * DAY }], NOW), 0);
});

console.log(`\n${n} test groups passed`);
