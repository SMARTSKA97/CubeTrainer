// Run: node --import ./tests/register.mjs tests/app-update.test.mjs
import assert from 'node:assert/strict';
import {
  parseVersion,
  compareVersions,
  pickUpdate,
  notesToLines,
  formatBytes,
  validRepo,
} from '../src/app/domain/app-update.ts';

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('ok  -', name);
};
const apk = (name = 'cubetrainer-1.apk', size = 5_000_000) => ({
  name,
  browser_download_url: `https://github.com/o/r/releases/download/x/${name}`,
  size,
});
const rel = (tag, extra = {}) => ({ tag_name: tag, assets: [apk()], ...extra });

t('parseVersion', () => {
  assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseVersion('v2.0'), [2, 0]);
  assert.deepEqual(parseVersion('1.2.3-beta'), [1, 2, 3]);
  assert.equal(parseVersion('abc'), null);
  assert.equal(parseVersion('1..2'), null);
});
t('compareVersions numeric, not lexical', () => {
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
  assert.ok(compareVersions('1.2', '1.2.1') < 0);
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
  assert.equal(compareVersions('x', '1.0'), 0);
});
t('pickUpdate picks the newest newer android release', () => {
  const u = pickUpdate(
    [rel('android-v1.0.5'), rel('android-v1.0.9', { body: 'Fixes' }), rel('android-v1.0.7')],
    '1.0.6',
  );
  assert.equal(u.version, '1.0.9');
  assert.equal(u.notes, 'Fixes');
  assert.equal(u.size, 5_000_000);
});
t('pickUpdate returns null when up to date or newer installed', () => {
  assert.equal(pickUpdate([rel('android-v1.0.6')], '1.0.6'), null);
  assert.equal(pickUpdate([rel('android-v1.0.6')], '2.0.0'), null);
  assert.equal(pickUpdate([], '1.0.0'), null);
});
t('pickUpdate ignores drafts, prereleases, other tags and releases without an apk', () => {
  const all = [
    rel('android-v9.0.0', { draft: true }),
    rel('android-v9.0.1', { prerelease: true }),
    rel('web-v9.0.2'),
    {
      tag_name: 'android-v9.0.3',
      assets: [{ name: 'notes.txt', browser_download_url: 'https://x/notes.txt', size: 1 }],
    },
    rel('android-vNEXT'),
  ];
  assert.equal(pickUpdate(all, '1.0.0'), null);
});
t('notesToLines strips markdown', () => {
  const l = notesToLines(
    "## What's new\n\n- **Faster** timer\n* See [docs](https://x.y)\n\n\n`code` end",
  );
  assert.deepEqual(l, ["What's new", '', '• Faster timer', '• See docs', '', 'code end']);
});
t('formatBytes', () => {
  assert.equal(formatBytes(5_242_880), '5.0 MB');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(0), '');
});
t('validRepo', () => {
  assert.equal(validRepo('SMARTSKA97/CubeTrainer'), true);
  assert.equal(validRepo('a/b/c'), false);
  assert.equal(validRepo('../x'), false);
  assert.equal(validRepo(''), false);
});
console.log(`${n} passed`);
