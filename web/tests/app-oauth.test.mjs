// Run: node --import ./tests/register.mjs tests/app-oauth.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { newVerifier, challengeFor, parseAppLink } from '../src/app/domain/app-oauth.ts';

let n = 0;
const t = async (name, fn) => {
  await fn();
  n++;
  console.log('ok  -', name);
};

await t('verifier is 43 url-safe characters and random', () => {
  const a = newVerifier();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, newVerifier());
});
await t('challenge equals base64url(sha256) like the API computes it', async () => {
  const v = 'app-verifier-0123456789';
  const expected = createHash('sha256').update(v).digest('base64url');
  assert.equal(await challengeFor(v), expected);
  assert.match(await challengeFor(newVerifier()), /^[A-Za-z0-9_-]{43}$/);
});
await t('parseAppLink reads each outcome', () => {
  assert.deepEqual(parseAppLink('cubetrainer://auth/done?code=abc%2Bdef&returnUrl=%2Ftimer'), {
    kind: 'done',
    code: 'abc+def',
    returnUrl: '/timer',
  });
  assert.deepEqual(parseAppLink('cubetrainer://auth/two-factor?challenge=c1'), {
    kind: 'two-factor',
    challenge: 'c1',
    returnUrl: null,
  });
  assert.deepEqual(parseAppLink('cubetrainer://auth/complete?ticket=t1&returnUrl=%2Ftoday'), {
    kind: 'complete',
    ticket: 't1',
    returnUrl: '/today',
  });
  assert.deepEqual(parseAppLink('cubetrainer://auth/error?error=external_denied'), {
    kind: 'error',
    error: 'external_denied',
  });
  assert.deepEqual(parseAppLink('cubetrainer://auth/error'), {
    kind: 'error',
    error: 'external_failed',
  });
});
await t('parseAppLink ignores everything else', () => {
  for (const bad of [
    'https://evil.test/auth/done?code=x',
    'cubetrainer://other/done?code=x',
    'cubetrainer://auth/done',
    'cubetrainer://auth/unknown?x=1',
    'nonsense',
    '',
  ]) {
    assert.equal(parseAppLink(bad), null, bad);
  }
});
console.log(`${n} passed`);
