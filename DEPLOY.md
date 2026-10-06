# Deploying CubeTrainer: Neon (database) + Render (API) + Cloudflare Pages (web app) + Brevo (email)

Order matters: **database → API → web app → tell the API the web app's address.**
Everything below can be done from the browser; you only need a GitHub repository.

> Free-plan limits change from time to time. Check the current limits on each site's pricing page.
> At the time of writing: Render's free web service sleeps after ~15 minutes without traffic (the next
> request takes up to about a minute to wake it), and Neon's free compute suspends when idle (wakes in a
> second or two). CubeTrainer is built for this: it works from the browser's own storage while the server
> sleeps and pushes everything up when the server answers.

---------------------------------------------------------------------------------------------------

## Checklist: accounts and what each one gives you

| # | Account | You need from it | Section |
|---|---|---|---|
| 1 | GitHub | the repository, Actions secrets | 0, 6 |
| 2 | Neon | `DATABASE_URL` (app role), direct URL + owner login for Flyway | 1 |
| 3 | Render | the API service, a deploy hook URL | 2 |
| 4 | Cloudflare | Pages project (web), optionally DNS | 3 |
| 5 | Brevo | an API key and a verified sender on your domain | 8c |
| 6 | Domain registrar | `app.` and `api.` subdomains, mail DNS records | 8d |
| 7 | Google / Microsoft / GitHub / Facebook (optional) | OAuth client id + secret each | 8b |

Generate two secrets first and store them in a password manager:
```bash
openssl rand -base64 64   # Jwt__SigningKey
openssl rand -base64 32   # Totp__EncryptionKey  (losing it locks 2FA users out; keep a backup)
```

### Every setting in one place

**Render (API)**

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | Neon string for the `cubetrainer_app` role (section 1) |
| `ASPNETCORE_ENVIRONMENT` | yes | `Production` |
| `Proxy__TrustForwardedHeaders` | yes | `true` (Render terminates TLS) |
| `Jwt__SigningKey` | yes | 64+ random characters |
| `Totp__EncryptionKey` | yes | 32 random bytes, base64 |
| `Email__Provider` / `Email__BrevoApiKey` / `Email__FromAddress` / `Email__FromName` | yes | `Brevo` / key / sender on your domain / `CubeTrainer` |
| `Web__BaseUrl` | yes | public web URL, no trailing slash (email links) |
| `CORS_ORIGINS` | yes | the same web URL (comma-separate several) |
| `Auth__Cookie__SameSite` | no | `Lax` when web and API share a domain (section 8d); otherwise `None` |
| `Auth__MinimumAge` | no | `13` (current decision; see README age note) |
| `ExternalAuth__CallbackBaseUrl` | no | public API URL if the API cannot tell (section 8b) |
| `ExternalAuth__Providers__<id>__ClientId` / `__ClientSecret` | no | per provider, switches its button on |

**Cloudflare Pages (web)**: `NODE_VERSION=24`, `API_URL=https://<api host>` (rebuild after changing it).

**GitHub Actions** (environment `production`): secrets `NEON_FLYWAY_URL`, `NEON_FLYWAY_USER`, `NEON_FLYWAY_PASSWORD`, `RENDER_DEPLOY_HOOK_URL`;
variables `API_BASE_URL`, `DEPLOY_ENABLED=true` (the deploy job stays off until you set it).

> This guide has not been run end to end against live accounts yet. Expect to adjust labels as the dashboards change, and test
> the first deploy with `/health/ready`, a registration email and a social login before telling anyone.

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

> The CI `deploy` job is skipped until you set the repository variable `DEPLOY_ENABLED` to `true`
> (GitHub -> Settings -> Secrets and variables -> Actions -> Variables) after adding the Neon/Render secrets.

## 8. Accounts (Phase 1): extra settings

Set these on the Render service (Environment):

| Variable | Value |
|---|---|
| `Jwt__SigningKey` | a random 64+ character secret (`openssl rand -base64 64`). The API refuses to start without it. |
| `Totp__EncryptionKey` | exactly 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts authenticator secrets; the API refuses to start without it. **Keep it safe and never change it casually**: if it is lost or replaced, everyone's authenticator secret becomes unreadable and users with 2FA on can only get in with a recovery code. |
| `Email__Provider` | `Brevo` (the `Log` provider is rejected in Production) |
| `Email__BrevoApiKey` | Brevo API key (Brevo -> SMTP & API -> API keys) |
| `Email__FromAddress` / `Email__FromName` | a sender on **your** domain, authenticated in Brevo (SPF + DKIM + DMARC), or mail lands in spam |
| `Web__BaseUrl` | your Cloudflare Pages URL, used in email links |
| `Auth__Cookie__SameSite` | `Lax` if web and API share a registrable domain (recommended: `app.example.com` + `api.example.com`); `None` only if they do not (needs HTTPS, and browsers may block third-party cookies) |
| `Auth__MinimumAge` | `13` (the current decision, also the default). India's DPDP Act asks for parental consent under 18: get legal advice before a public launch (see the age note in the README). |

The sign-in cookie is `HttpOnly`, so put web and API under one domain you own for the most reliable behaviour.

### Your solves belong to your account (Phase 3)

* Every solve and case status now has an owner, and the solve, stats and summary endpoints require sign-in.
* Migration `V3` **renames** the old shared tables to `legacy_solves` / `legacy_case_status` (nothing is deleted) and creates
  per-user tables. The previous API release stops working the moment V3 is applied, so deploy the new API right after the
  migration (the CI `deploy` job does both in order). Old rows are not shown in the app; export them first from the
  History page (**Export JSON**) and **Import JSON** after signing in, or `DROP TABLE legacy_solves, legacy_case_status;` once you no longer need them.
* Deletes are kept as tombstones so your other devices learn about them. A cleanup job can purge old tombstones later.

## 8b. Social login (Google, Microsoft, GitHub, Facebook)

Each button appears only after you configure that provider. Create an OAuth app with the provider, and use this redirect URL
(replace the host with your public **API** URL, or the web URL if you proxy `/api` through it):

`https://<api-host>/api/v1/auth/external/<provider>/callback` with `<provider>` = `google`, `microsoft`, `github` or `facebook`.

Then set on Render:

| Variable | Value |
|---|---|
| `ExternalAuth__Providers__google__ClientId` / `__ClientSecret` | from Google Cloud Console -> APIs & Services -> Credentials (OAuth client, type Web) |
| `ExternalAuth__Providers__microsoft__ClientId` / `__ClientSecret` | Azure portal -> App registrations (supported accounts: personal + organisational) |
| `ExternalAuth__Providers__github__ClientId` / `__ClientSecret` | GitHub -> Settings -> Developer settings -> OAuth Apps |
| `ExternalAuth__Providers__facebook__ClientId` / `__ClientSecret` | Meta for Developers -> Facebook Login |
| `ExternalAuth__CallbackBaseUrl` | the public API base URL, if it differs from what the API sees (behind a proxy) |

How it behaves: a new person picks a username, country and birth year after the provider confirms who they are. An existing
password account is linked automatically only when the provider has verified the same email; otherwise the person signs in
and connects the provider in Settings. Accounts without a password delete themselves by typing their username.

Data Protection keys (used for the short-lived sign-in state) live in memory, so a redeploy during a sign-in just asks the
person to try again. No action needed.

## 8c. Brevo: transactional email

1. Sign up at **brevo.com**. **Senders, domains & dedicated IPs -> Domains -> Add a domain** (your own, e.g. `example.com`).
2. Brevo shows DNS records (a Brevo verification code, **DKIM**, and a recommended **DMARC**). Add them at your DNS provider, then **Authenticate**.
   Also publish one **SPF** record covering Brevo: `v=spf1 include:spf.brevo.com ~all` (merge into an existing SPF record, only one is allowed).
3. **Senders -> Add a sender**: e.g. `no-reply@example.com`, name `CubeTrainer`. This is `Email__FromAddress` / `Email__FromName`.
4. **SMTP & API -> API keys -> Generate**: this is `Email__BrevoApiKey` (the API uses Brevo's HTTPS API, not SMTP).
5. Set `Email__Provider=Brevo` on Render. Register a test account: the confirmation email should arrive within seconds and not in spam.

Without a verified domain, mail goes out from a shared address and is likely to be filtered. Free-plan sending limits change; check Brevo's pricing page.

## 8d. Custom domain and DNS

Recommended: **one registrable domain** so the sign-in cookie is first-party.

| Name | Type | Points to |
|---|---|---|
| `app.example.com` | CNAME | your Pages project (`<project>.pages.dev`), added in Pages -> Custom domains |
| `api.example.com` | CNAME | `<service>.onrender.com`, added in Render -> Settings -> Custom Domains (Render issues the certificate) |
| Brevo records | TXT / CNAME | from section 8c |

Then update: Cloudflare `API_URL=https://api.example.com` (rebuild), Render `Web__BaseUrl=https://app.example.com`, `CORS_ORIGINS=https://app.example.com`,
`Auth__Cookie__SameSite=Lax`, GitHub variable `API_BASE_URL=https://api.example.com`, and the redirect URL in each OAuth app
(`https://api.example.com/api/v1/auth/external/<provider>/callback`).

Using the default `*.pages.dev` + `*.onrender.com` hosts instead works only with `Auth__Cookie__SameSite=None`, and browsers that block third-party
cookies (Safari, some Chrome settings) will keep asking people to sign in again. Use a custom domain for anything beyond testing.

## 11. Android app (sideloaded APK)

1. Render: add `https://localhost` to `CORS_ORIGINS` (comma separated with your web URL). The app runs from that origin inside the phone.
2. GitHub: repository **variable** `API_BASE_URL` = your public API URL (same one the deploy job uses).
3. GitHub -> Actions -> **Android APK** -> Run workflow. Download the `cubetrainer-apk-<version>` artifact (a zip containing the APK).
   The debug APK installs on any phone that allows unknown apps. It is signed with a debug key, which is fine for your own use.
4. Optional, for a properly signed release APK (needed later for the Play Store): create a keystore once and keep it safe, losing it means you can never update the app:
   ```bash
   keytool -genkeypair -v -keystore cubetrainer-release.jks -alias cubetrainer -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 cubetrainer-release.jks      # paste into the secret below
   ```
   Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The workflow then also builds `app-release.apk`.
5. Before a Play Store release change `appId` in `mobile/capacitor.config.json` (and the `applicationId`/`namespace` in `mobile/android/app/build.gradle`) to an id on your own domain; it cannot be changed after publishing.

### 11b. Publishing updates (in-app updater, like Obtainium / Orion Store)

The app checks this repository's GitHub Releases (at most once a day, plus **Updates -> Check for updates**), shows the changelog, downloads the APK and opens Android's installer.

1. The keystore secrets from step 4 are **required** for releases: Android only installs an update signed with the same key as the installed app. A debug APK from a normal run cannot update another one.
2. To release: `git tag android-v1.1.0 && git push origin android-v1.1.0`. The workflow builds the signed APK and creates the release `CubeTrainer 1.1.0` with `CubeTrainer-1.1.0.apk`, its `.sha256`, and a changelog made from the commit subjects since the previous `android-v*` tag. Add `mobile/release-notes/1.1.0.md` before tagging to put a hand-written summary above the commit list.
3. The version in the tag must be higher than the installed one (it is compared as numbers: 1.10.0 is newer than 1.9.0). The first install has to be done by hand (step 3 or the release's APK); updates come from inside the app after that.
4. The repository must be public (the app reads releases without a login). The repository name is baked in at build time (`UPDATES_REPO`, set automatically to the repository running the workflow).
5. On the first update Android asks you to allow "Install unknown apps" for CubeTrainer; allow it, return to the app and press Update again.

Signing in works with email and password, two-step codes and social login (the provider page opens in the phone's browser and returns to the app; no extra provider settings, ADR 0013). Connecting or disconnecting providers is web-only for now. Confirmation and reset links in emails open in the phone's browser; confirm there, then sign in in the app.

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Badge stays "Saved in this browser" | `API_URL` wrong in Cloudflare (rebuild after changing it), or `CORS_ORIGINS` missing/typo. Open the browser console: a CORS error names the origin to allow. |
| First load takes ~1 min | Free Render service was asleep. Normal. |
| Render log: `password authentication failed` | wrong `DATABASE_URL`; copy it again from Neon → Connect. |
| `/health/ready` is `Unhealthy` | Database asleep/unreachable, or Flyway has not run: check the `deploy` job in GitHub Actions. |
| API exits at start: `No database configured` | `DATABASE_URL` missing on Render. |
| API exits at start mentioning `Jwt` or `Totp` | `Jwt__SigningKey` / `Totp__EncryptionKey` missing or malformed (the Totp key must be 32 bytes base64). |
| No confirmation email | `Email__Provider` not `Brevo`, wrong key, or the sender/domain is not verified in Brevo; check Render logs for the Brevo response. |
| Signed out again on every visit | web and API on different domains with `SameSite=Lax`, or third-party cookies blocked: use section 8d. |
| Android app: sign-in fails with a network/CORS error | `https://localhost` missing from `CORS_ORIGINS`, or the APK was built without `API_BASE_URL`. |
| Social login: `redirect_uri_mismatch` | the callback URL in the provider console must match section 8b exactly (set `ExternalAuth__CallbackBaseUrl` behind a proxy). |
| 404 on refresh of `/trainer` | `_redirects` missing from the deployed output; it lives in `web/public/`. |
| Old version still showing after a deploy | The service worker serves the cached copy once, then updates; reload twice. |

## 10. Upgrading from the pre-Flyway version

Early dev databases were created by EF Core with PascalCase columns and cannot be migrated in place. Export your
solves first (History -> **Export JSON**), point the API at a fresh database (new Neon branch or `DROP SCHEMA public CASCADE;
CREATE SCHEMA public;`), let Flyway create the tables, then **Import JSON**.
