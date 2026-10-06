# Deploying CubeTrainer: Neon (database) + Render (API) + Cloudflare Pages (web app)

Order matters: **database → API → web app → tell the API the web app's address.**
Everything below can be done from the browser; you only need a GitHub repository.

> Free-plan limits change from time to time. Check the current limits on each site's pricing page.
> At the time of writing: Render's free web service sleeps after ~15 minutes without traffic (the next
> request takes up to about a minute to wake it), and Neon's free compute suspends when idle (wakes in a
> second or two). CubeTrainer is built for this: it works from the browser's own storage while the server
> sleeps and pushes everything up when the server answers.

---------------------------------------------------------------------------------------------------

## 0. Put the project on GitHub

```bash
cd cube-trainer
git init && git add . && git commit -m "CubeTrainer"
# create an empty repository on github.com first, then:
git remote add origin https://github.com/<you>/cube-trainer.git
git branch -M main && git push -u origin main
```
`.gitignore` already excludes `node_modules`, `dist`, `bin`, `obj`.

---------------------------------------------------------------------------------------------------

## 1. Neon: the PostgreSQL database

1. Sign up at **neon.tech** and click **Create project**.
2. Name: `cubetrainer`. Postgres version: the default. **Region: pick the one closest to the Render
   region you will use** (e.g. Singapore for both, since you are in India). Keeping them in the same
   region makes every query faster.
3. After creating, open **Connect** (button on the project dashboard). Choose the branch `main`,
   the default database (`neondb`) and role. Turn **Connection pooling ON** and copy the string. It looks like

   ```
   postgresql://neondb_owner:XXXXXXXX@ep-something-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Keep it secret: it contains the password. This is your `DATABASE_URL`.

You do **not** create tables by hand. The Flyway migrations in `db/migrations` create and update them
(step 1b). Use the **direct** (non-pooled) connection string for Flyway: it takes advisory locks, which the
pooler does not support. The API itself may use the pooled string.

### 1b. Create the app role and run the first migration

In Neon's **SQL Editor** run once (pick your own password):
```sql
CREATE ROLE cubetrainer_app LOGIN PASSWORD '<long random password>';
```
This role gets read/write rights on the tables but cannot create or drop anything; the API uses it.
Then add the GitHub secrets/variables below; the first push to `main` runs Flyway for you. To run it yourself:
```bash
docker run --rm -v "$PWD/db/migrations:/flyway/sql:ro" flyway/flyway:13-alpine \
  -url="jdbc:postgresql://<direct-host>/neondb?sslmode=require" -user=<owner> -password=<owner password> \
  -locations=filesystem:/flyway/sql migrate
```
Build the API's `DATABASE_URL` from the `cubetrainer_app` role: `postgresql://cubetrainer_app:<password>@<host>/neondb?sslmode=require`.

---------------------------------------------------------------------------------------------------

## 2. Render: the .NET API

### Option A: Blueprint (fastest)
1. Sign up at **render.com**, connect your GitHub account.
2. **New → Blueprint**, pick your repository. Render reads `render.yaml`.
3. When asked for the secret values enter
   - `DATABASE_URL` = the Neon string from step 1
   - `CORS_ORIGINS` = leave a placeholder (`https://placeholder.pages.dev`), you fix it in step 4.
4. **Apply**. The first build takes a few minutes (Docker build + `dotnet publish`).

### Option B: by hand
1. **New → Web Service** → pick the repository.
2. Settings
   - Language / Runtime: **Docker**
   - Root Directory: `api`
   - Dockerfile Path: `./Dockerfile`
   - **Auto-Deploy: Off** (GitHub Actions migrates the database first, then calls the deploy hook)
   - Instance type: **Free**
   - Region: same as Neon (Singapore)
   - Health Check Path: `/health/ready`
3. **Environment** → add
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string |
   | `CORS_ORIGINS` | your Cloudflare Pages URL (fill in after step 3) |
   | `ASPNETCORE_ENVIRONMENT` | `Production` |
   | `Proxy__TrustForwardedHeaders` | `true` |

   You do **not** set `PORT`: Render sets it and the API listens on it.
4. **Create Web Service**.

### Check it
When the deploy is *Live*, open `https://<your-service>.onrender.com/health/ready`.
You should see `Healthy`. (`/health/live` only says the process is up; `/health/ready` also checks the database and that the migrations ran.)
(The first call after a sleep can take about a minute.)

Also try `https://<your-service>.onrender.com/api/v1/summary?tz=330` (daily summary for Life OS, 330 = India).

---------------------------------------------------------------------------------------------------

## 3. Cloudflare Pages: the Angular app

1. Sign up at **dash.cloudflare.com** → **Workers & Pages → Create → Pages → Connect to Git**
   (pick your repository). If the dashboard only offers *Workers*, use the "Direct upload" route below.
2. Build settings
   - Framework preset: **None**
   - **Root directory:** `web`
   - **Build command:** `npm ci && node scripts/write-config.mjs && npx ng build`
   - **Build output directory:** `dist/web/browser`
3. **Environment variables** (Production)
   | Name | Value |
   |---|---|
   | `NODE_VERSION` | `24` |
   | `API_URL` | `https://<your-service>.onrender.com` (no trailing slash, no `/api`; the app adds `/api/v1`) |

   `scripts/write-config.mjs` turns `API_URL` into `config.json` at build time, so the same code runs
   locally (`/api/v1`) and in the cloud.
4. **Save and Deploy.** You get `https://<project>.pages.dev`.

`public/_redirects` makes deep links such as `/trainer` work, and `public/_headers` keeps `sw.js` and
`config.json` from being cached stale.

### Direct upload instead (no Git integration)
```bash
cd web
API_URL=https://<your-service>.onrender.com node scripts/write-config.mjs
npm ci && npx ng build
npx wrangler pages deploy dist/web/browser --project-name cubetrainer
```
(`wrangler` asks you to log in to Cloudflare the first time.)

---------------------------------------------------------------------------------------------------

## 4. Let the web app talk to the API (CORS)

Browsers only let `https://<project>.pages.dev` call your API if the API allows that origin.

1. Render → your service → **Environment** → set `CORS_ORIGINS` to
   `https://<project>.pages.dev` (several origins: comma separated; no trailing slash).
2. Save. Render redeploys.
3. Open your Pages URL. The badge in the top right should change from *Connecting…* to **Synced to server**
   (give it up to a minute if the API was asleep). Solve on your phone, open the site on your laptop:
   same data.

Custom domain later? Add it in Cloudflare Pages and add that origin to `CORS_ORIGINS` as well.

---------------------------------------------------------------------------------------------------

## 5. Install it on your phone (works offline)

Open the Pages URL in Chrome/Safari → menu → **Add to Home screen**. A service worker caches the app and
the algorithm data, so it opens without a network; solves are saved on the phone and synced later.

---------------------------------------------------------------------------------------------------

## 6. Updating

`git push` to `main`. GitHub Actions (`.github/workflows/ci.yml`) builds and tests everything, runs Flyway against
Neon, then triggers the Render deploy. Cloudflare Pages rebuilds the web app through its own Git integration.

GitHub repository settings needed for the `deploy` job (Settings -> Secrets and variables -> Actions, environment `production`):

| Name | Kind | Value |
|---|---|---|
| `NEON_FLYWAY_URL` | secret | `jdbc:postgresql://<direct-host>/neondb?sslmode=require` |
| `NEON_FLYWAY_USER` / `NEON_FLYWAY_PASSWORD` | secret | the Neon owner role (it needs DDL rights) |
| `RENDER_DEPLOY_HOOK_URL` | secret | Render service -> Settings -> Deploy Hook |
| `API_BASE_URL` | variable | `https://<your-service>.onrender.com` |

Schema changes are a new `db/migrations/V<n>__name.sql` file in the same commit as the code that needs them.

## 7. Backups and moving data

* History page → **Export JSON** / **Import JSON** moves your solves between browsers.
* Neon keeps point-in-time history on its free plan for a limited window; for a copy of your own:
  `pg_dump "<DATABASE_URL>" > cubetrainer.sql`.

## 8. Accounts (Phase 1): extra settings

Set these on the Render service (Environment):

| Variable | Value |
|---|---|
| `Jwt__SigningKey` | a random 64+ character secret (`openssl rand -base64 64`). The API refuses to start without it. |
| `Email__Provider` | `Brevo` (the `Log` provider is rejected in Production) |
| `Email__BrevoApiKey` | Brevo API key (Brevo -> SMTP & API -> API keys) |
| `Email__FromAddress` / `Email__FromName` | a sender on **your** domain, authenticated in Brevo (SPF + DKIM + DMARC), or mail lands in spam |
| `Web__BaseUrl` | your Cloudflare Pages URL, used in email links |
| `Auth__Cookie__SameSite` | `Lax` if web and API share a registrable domain (recommended: `app.example.com` + `api.example.com`); `None` only if they do not (needs HTTPS, and browsers may block third-party cookies) |
| `Auth__MinimumAge` | 13 by default. Decide your policy (see the age note in the README), India's DPDP Act needs parental consent under 18. |

The sign-in cookie is `HttpOnly`, so put web and API under one domain you own for the most reliable behaviour.

**Still open:** solve endpoints are not user-scoped yet, so anyone who finds the API URL can read and delete the shared solve
data. User-scoped storage and device sync arrive in Phase 3. Do not store anything private there until then.

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Badge stays "Saved in this browser" | `API_URL` wrong in Cloudflare (rebuild after changing it), or `CORS_ORIGINS` missing/typo. Open the browser console: a CORS error names the origin to allow. |
| First load takes ~1 min | Free Render service was asleep. Normal. |
| Render log: `password authentication failed` | wrong `DATABASE_URL`; copy it again from Neon → Connect. |
| `/health/ready` is `Unhealthy` | Database asleep/unreachable, or Flyway has not run: check the `deploy` job in GitHub Actions. |
| API exits at start: `No database configured` | `DATABASE_URL` missing on Render. |
| 404 on refresh of `/trainer` | `_redirects` missing from the deployed output; it lives in `web/public/`. |
| Old version still showing after a deploy | The service worker serves the cached copy once, then updates; reload twice. |

## 10. Upgrading from the pre-Flyway version

Early dev databases were created by EF Core with PascalCase columns and cannot be migrated in place. Export your
solves first (History -> **Export JSON**), point the API at a fresh database (new Neon branch or `DROP SCHEMA public CASCADE;
CREATE SCHEMA public;`), let Flyway create the tables, then **Import JSON**.
