// Writes public/config.json before the build. Used by Cloudflare Pages:
//   API_URL=https://cubetrainer-api.onrender.com node scripts/write-config.mjs
// Without API_URL the app keeps talking to the same-origin "/api" (local dev, Docker).
import { writeFileSync } from 'node:fs';

const raw = (process.env.API_URL ?? '').trim().replace(/\/+$/, '');
const apiBase = raw
  ? /\/api(\/v1)?$/.test(raw)
    ? raw.replace(/\/api$/, '/api/v1')
    : `${raw}/api/v1`
  : '/api/v1';
// UPDATES_REPO ("owner/name") is where the Android app looks for new APK releases; leave it out to disable in-app updates.
const updatesRepo = (process.env.UPDATES_REPO ?? '').trim();
const cfg = updatesRepo ? { apiBase, updatesRepo } : { apiBase };
writeFileSync(
  new URL('../public/config.json', import.meta.url),
  JSON.stringify(cfg, null, 2) + '\n',
);
console.log(
  'config.json -> apiBase =',
  apiBase,
  updatesRepo ? `, updatesRepo = ${updatesRepo}` : '',
);
