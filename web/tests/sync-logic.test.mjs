// Run: node --import ./tests/register.mjs tests/sync-logic.test.mjs
import assert from 'node:assert/strict';
import {
  enqueue,
  pendingKeys,
  mergeRemoteSolves,
  mergeRemoteStatuses,
  fromRemote,
  isRetryable,
} from '../src/app/core/data/sync-logic.ts';

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('ok  -', name);
};
const solve = (id, extra = {}) => ({
  id,
  at: 1,
  timeMs: 1000,
  penalty: 'none',
  scramble: 'R',
  mode: 'random',
  ...extra,
});
const remote = (id, extra = {}) => ({
  ...solve(id),
  rev: 1,
  deleted: false,
  setId: null,
  caseId: null,
  auf: null,
  inspectionMs: null,
  stage: null,
  tags: null,
  ...extra,
});

t('patch folds into a queued put', () => {
  let q = enqueue([], { k: 'put', solve: solve('a') });
  q = enqueue(q, { k: 'patch', id: 'a', penalty: 'dnf' });
  q = enqueue(q, { k: 'patch', id: 'a', tags: ['pause'] });
  assert.equal(q.length, 1);
  assert.equal(q[0].solve.penalty, 'dnf');
  assert.deepEqual(q[0].solve.tags, ['pause']);
});
t('patches to a server-known solve merge into one', () => {
  let q = enqueue([], { k: 'patch', id: 'a', penalty: 'plus2' });
  q = enqueue(q, { k: 'patch', id: 'a', tags: ['x'] });
  assert.deepEqual(q, [{ k: 'patch', id: 'a', penalty: 'plus2', tags: ['x'] }]);
});
t('delete drops earlier put/patch for that id but is still sent', () => {
  let q = enqueue([], { k: 'put', solve: solve('a') });
  q = enqueue(q, { k: 'put', solve: solve('b') });
  q = enqueue(q, { k: 'del', id: 'a' });
  assert.deepEqual(
    q.map((o) => o.k + ':' + (o.id ?? o.solve?.id)),
    ['put:b', 'del:a'],
  );
});
t('latest status per case wins', () => {
  let q = enqueue([], { k: 'status', caseId: 'J1', status: 'learning' });
  q = enqueue(q, { k: 'status', caseId: 'J2', status: 'learning' });
  q = enqueue(q, { k: 'status', caseId: 'J1', status: 'finished' });
  assert.deepEqual(
    q.map((o) => o.caseId + '=' + o.status),
    ['J2=learning', 'J1=finished'],
  );
});
t('pendingKeys lists ids and cases with queued changes', () => {
  const k = pendingKeys([
    { k: 'put', solve: solve('a') },
    { k: 'del', id: 'b' },
    { k: 'status', caseId: 'J1', status: 'learning' },
  ]);
  assert.deepEqual([...k.solves].sort(), ['a', 'b']);
  assert.deepEqual([...k.cases], ['J1']);
  assert.equal(k.clearAll, false);
  assert.equal(pendingKeys([{ k: 'clear' }]).clearAll, true);
});
t('fromRemote turns server nulls into missing fields', () => {
  const s = fromRemote(remote('a', { caseId: 'J1', tags: ['pause'], auf: 0 }));
  assert.deepEqual(Object.keys(s).sort(), [
    'at',
    'auf',
    'caseId',
    'id',
    'mode',
    'penalty',
    'scramble',
    'tags',
    'timeMs',
  ]);
  assert.equal('rev' in s, false);
});
t('merge: remote edits replace, tombstones remove, pending rows are left alone', () => {
  const local = [solve('keep'), solve('edit'), solve('gone'), solve('mine', { penalty: 'dnf' })];
  const merged = mergeRemoteSolves(
    local,
    [
      remote('edit', { penalty: 'plus2' }),
      remote('gone', { deleted: true }),
      remote('new'),
      remote('mine', { penalty: 'none' }),
    ],
    new Set(['mine']),
  );
  const by = Object.fromEntries(merged.map((s) => [s.id, s]));
  assert.deepEqual(Object.keys(by).sort(), ['edit', 'keep', 'mine', 'new']);
  assert.equal(by.edit.penalty, 'plus2');
  assert.equal(by.mine.penalty, 'dnf');
});
t('merge statuses honours pending cases', () => {
  const m = mergeRemoteStatuses(
    { J1: 'learning' },
    [
      { caseId: 'J1', status: 'finished' },
      { caseId: 'J2', status: 'learning' },
    ],
    new Set(['J1']),
  );
  assert.deepEqual(m, { J1: 'learning', J2: 'learning' });
});
t('retry classification', () => {
  for (const s of [0, 401, 408, 429, 500, 503]) assert.equal(isRetryable(s), true, String(s));
  for (const s of [400, 403, 404, 409, 422]) assert.equal(isRetryable(s), false, String(s));
});
console.log(`\n${n} passed`);
