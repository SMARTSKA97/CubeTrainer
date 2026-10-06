// Lets Node run the Angular sources directly: resolves extension-less relative imports ('./cube') to '.ts'.
// Usage: node --import ./tests/register.mjs tests/<file>.test.mjs
import { register } from 'node:module';
register('./resolve-ts.mjs', import.meta.url);
