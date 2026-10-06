// Run: node tests/stats.test.mjs
import assert from 'node:assert/strict';
import {
  averageOf,
  best,
  mean,
  sessionStats,
  formatTime,
  formatSolve,
  retryComparison,
  effective,
} from '../src/app/domain/stats.ts';
import { evaluateCase, DEFAULT_RULES, targetSeconds } from '../src/app/domain/learning.ts';

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('ok  -', name);
};
const mk = (ms, penalty = 'none', scramble = 'R', at = 0) => ({
  id: String(Math.random()),
  at,
  timeMs: ms,
  penalty,
  scramble,
  mode: 'random',
});

t('formatting', () => {
  assert.equal(formatTime(9876), '9.88');
  assert.equal(formatTime(61230), '1:01.23');
  assert.equal(formatTime(null), 'DNF');
  assert.equal(formatSolve(mk(5000, 'plus2')), '7.00+');
  assert.equal(formatSolve(mk(5000, 'dnf')), 'DNF');
});

// Same data as the API check: 10.0 11.0 12.0 13.0 DNF 9.0  ->  count 6, best 9000, mean 11000, ao5 12000
t('stats match the .NET API for the same solves', () => {
  const solves = [mk(10000), mk(11000), mk(12000), mk(13000), mk(14000, 'dnf'), mk(9000)];
  const s = sessionStats(solves);
  assert.equal(s.count, 6);
  assert.equal(s.best, 9000);
  assert.equal(s.mean, 11000);
  assert.equal(s.ao5, 12000);
  assert.equal(s.bestAo5, 12000);
  assert.equal(s.ao12, undefined);
});

t('plus2 counts, two DNFs in an Ao5 make it DNF, Ao5 needs 5 solves', () => {
  assert.equal(effective(mk(10000, 'plus2')), 12000);
  assert.equal(averageOf([mk(1), mk(2), mk(3), mk(4)], 5), undefined);
  assert.equal(
    averageOf([mk(1000), mk(2000, 'dnf'), mk(3000, 'dnf'), mk(4000), mk(5000)], 5),
    null,
  );
  assert.equal(averageOf([mk(1000), mk(2000, 'dnf'), mk(3000), mk(4000), mk(5000)], 5), 4000); // drops 1000 and DNF
});

t('best/mean ignore DNF', () => {
  assert.equal(best([mk(5000, 'dnf'), mk(7000)]), 7000);
  assert.equal(mean([mk(5000, 'dnf'), mk(7000), mk(9000)]), 8000);
  assert.equal(best([mk(5000, 'dnf')]), null);
});

t('retry comparison finds earlier attempts on the same scramble', () => {
  const h = [
    mk(12000, 'none', 'A', 1),
    mk(9000, 'none', 'B', 2),
    mk(10500, 'none', 'A', 3),
    mk(11000, 'dnf', 'A', 4),
  ];
  const c = retryComparison(h, 'A');
  assert.equal(c.attempts, 3);
  assert.equal(c.best, 10500);
  assert.equal(c.last, null); // last attempt was a DNF
  assert.equal(retryComparison(h, 'Z').attempts, 0);
});

// ---------------------------------------------------------------- auto-learning
{
  const DAY = 86400000;
  const mk = (times, dayOf = (i) => i, pen = 'none') =>
    times.map((t, i) => ({
      id: String(i),
      at: 1_700_000_000_000 + dayOf(i) * DAY,
      timeMs: t,
      penalty: Array.isArray(pen) ? pen[i] : pen,
      scramble: 's',
      mode: 'case',
      caseId: 'c',
    }));
  const T = 5000;
  t('learning: no solves = unlearned, one solve = learning', () => {
    assert.equal(evaluateCase([], T).status, 'unlearned');
    assert.equal(evaluateCase(mk([3000]), T).status, 'learning');
  });
  t('learning: five fast solves on different days -> finished', () => {
    const r = evaluateCase(mk([4000, 4200, 3900, 4100, 4300]), T, 'learning');
    assert.equal(r.status, 'finished', r.reason);
  });
  t('learning: five fast solves on ONE day stay learning (spacing rule), unless minDays=1', () => {
    const same = mk([4000, 4200, 3900, 4100, 4300], () => 0);
    assert.equal(evaluateCase(same, T, 'learning').status, 'learning');
    assert.equal(
      evaluateCase(same, T, 'learning', { ...DEFAULT_RULES, minDays: 1 }).status,
      'finished',
    );
  });
  t('learning: too slow, a DNF, or one outlier prevents finished', () => {
    assert.equal(evaluateCase(mk([6000, 6000, 6000, 6000, 6000]), T).status, 'learning');
    assert.equal(
      evaluateCase(
        mk([4000, 4000, 4000, 4000, 4000], (i) => i, ['none', 'none', 'dnf', 'none', 'none']),
        T,
      ).status,
      'learning',
    );
    assert.equal(evaluateCase(mk([2000, 2000, 2000, 2000, 9000]), T).status, 'learning'); // mean 3.4 but 9s > 1.6x
  });
  t('learning: +2 penalty counts; finished is demoted after slow solves, with hysteresis', () => {
    assert.equal(
      evaluateCase(
        mk([3200, 3200, 3200, 3200, 3200], (i) => i, 'plus2'),
        T,
      ).status,
      'learning',
    ); // 5.2 s with penalty
    assert.equal(
      evaluateCase(
        mk([3000, 3000, 3000, 3000, 3000], (i) => i, 'plus2'),
        T,
      ).status,
      'finished',
    ); // exactly 5.0 s
  });
  t('learning: demotion', () => {
    const good = mk([4000, 4000, 4000, 4000, 4000]);
    assert.equal(evaluateCase(good, T, 'finished').status, 'finished');
    const bad = [
      ...good,
      ...mk([9000, 9500, 9000]).map((x, i) => ({ ...x, at: x.at + (10 + i) * DAY })),
    ];
    assert.equal(evaluateCase(bad, T, 'finished').status, 'learning');
    // a single slow solve does not demote a finished case
    const one = [...good, ...mk([9000]).map((x) => ({ ...x, at: x.at + 10 * DAY }))];
    assert.equal(evaluateCase(one, T, 'finished').status, 'finished');
  });
  t('learning: targets have defaults per set and can be overridden', () => {
    assert.equal(targetSeconds('pll'), 4.5);
    assert.equal(targetSeconds('pll', { pll: 3 }), 3);
    assert.equal(targetSeconds('unknown'), 8);
  });
}

console.log(`\n${n} test groups passed`);
