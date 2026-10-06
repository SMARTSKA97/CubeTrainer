// Writes public/config.json before the build. Used by Cloudflare Pages:
//   API_URL=https://cubetrainer-api.onrender.com node scripts/write-config.mjs
// Without API_URL the app keeps talking to the same-origin "/api" (local dev, Docker).
import { writeFileSync } from 'node:fs';

const raw = (process.env.API_URL ?? '').trim().replace(/\/+$/, '');
const apiBase = raw ? (/\/api(\/v1)?$/.test(raw) ? raw.replace(/\/api$/, '/api/v1') : `${raw}/api/v1`) : '/api/v1';
writeFileSync(new URL('../public/config.json', import.meta.url), JSON.stringify({ apiBase }, null, 2) + '\n');
console.log('config.json -> apiBase =', apiBase);
