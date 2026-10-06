// Run: node --import ./tests/register.mjs tests/auth-utils.test.mjs
import assert from 'node:assert/strict';
import {
  toProblem,
  passwordStrength,
  describeAgent,
  regionFromLocale,
} from '../src/app/core/auth/auth-utils.ts';

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log('ok  -', name);
};

t('toProblem reads code, detail and errors', () => {
  const p = toProblem({
    status: 400,
    error: { code: 'validation_failed', detail: 'Bad', errors: ['a', 'b'] },
  });
  assert.deepEqual(p, {
    status: 400,
    code: 'validation_failed',
    message: 'Bad',
    details: ['a', 'b'],
  });
});
t('toProblem handles network failure', () => {
  const p = toProblem({ status: 0, error: null });
  assert.equal(p.code, 'network');
  assert.match(p.message, /Cannot reach/);
});
t('toProblem maps 429', () =>
  assert.equal(toProblem({ status: 429, error: {} }).code, 'rate_limited'),
);
t('toProblem survives garbage', () => assert.equal(toProblem(null).code, 'network'));

t('password: too short is 0', () => assert.equal(passwordStrength('abc', 10), 0));
t('password: repeated chars are weak', () => assert.equal(passwordStrength('aaaaaaaaaaaa', 10), 1));
t('password: passphrase is strong', () =>
  assert.equal(passwordStrength('correct horse battery staple', 10), 4),
);
t('password: length beats composition', () =>
  assert.ok(passwordStrength('abcdefghijklmnopqrstu', 10) >= passwordStrength('Ab1!xyzqwe', 10)),
);

t('describeAgent', () => {
  assert.equal(
    describeAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537'),
    'Chrome on Windows',
  );
  assert.equal(describeAgent(null), 'Unknown device');
});
t('regionFromLocale', () => {
  assert.equal(regionFromLocale('en-IN'), 'IN');
  assert.equal(regionFromLocale('en'), null);
  assert.equal(regionFromLocale(undefined), null);
});
console.log(`\n${n} passed`);
