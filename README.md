# CubeTrainer

Rubik's cube timer + exact-case algorithm trainer. Angular 22 front end, ASP.NET Core 10 (.NET 10 LTS) API, PostgreSQL.

## Features

**Timer (random scrambles)**
- 20-move random scramble (15/25 selectable), scramble preview net, previous/next scramble (`Alt+←/→`)
- Space / touch timer: hold until green, release to start, any key/tap stops
- Optional WCA 15 s inspection (+2 after 15 s, DNF after 17 s, optional beeps at 8 s and 12 s)
- Every solve stores its scramble. **Retry this scramble** (right after a solve, or any time from History) and the app tells you whether you improved against your previous attempts on that exact scramble
- Mean, best, Ao5, Ao12, Ao100, best Ao5/Ao12; +2 / DNF / delete

**Case trainer (J-Perm algorithms)**
- 8 sets from your saved J-Perm pages: 2-Look OLL (10), 2-Look PLL (6), Full OLL (57), Full PLL (21), COLL (28), Winter Variation (27), One-Handed OLL (57), One-Handed PLL (21)
- The scramble produces *exactly* the chosen case with everything outside it solved (F2L for OLL/PLL/COLL): it is the inverse of the algorithm applied to a solved cube. Example: Antisune `R U2 R' U' R U' R'` gets the scramble `R U R' U R U2 R'`
- Pick the cases / groups to practise, "only learning / unlearned" filters, "focus on weak cases", optional random AUF, hide case name for recognition practice, show/hide the algorithm (`←/→`)
- Per-case best / mean / Ao5, learning status (unlearned / learning / finished), retry of an old case scramble

**Algorithms page**: sortable list with J-Perm's case pictures, copy button, status, best/Ao5, "Train" button.
**History**: all solves, progress chart with Ao5 line, same-scramble comparison, export JSON/CSV.

Hold the cube any way you like for a case scramble: the last layer is whichever face you hold on top.

## Local setup

### Prerequisites
| Tool | Version | Needed for |
|---|---|---|
| Node.js | 24 LTS (>= 22.18 runs the tests) | web app |
| .NET SDK | 10 | API |
| Docker + Docker Compose | recent | the all-in-one route and local Postgres (optional) |
| PostgreSQL | 18 (16+ works) | only if you do not use Docker (optional) |

Clone, then pick **one** of the three routes.

### Route 1: fastest, nothing to install but the SDKs (in-memory API)
Data is lost when the API stops; good for UI work.
```
# terminal 1: API on http://localhost:8080
cd api/src/CubeTrainer.Api
ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:8080 dotnet run

# terminal 2: web on http://localhost:4200 (proxies /api to :8080)
cd web && npm ci && npm start
```
Development mode uses built-in dev keys for tokens and 2FA, prints every email (confirmation and reset links) to the API console,
and exposes the OpenAPI document at `/openapi/v1.json`. Register in the app, copy the confirmation link from the API console, open it, sign in.
(`-p:OfflineBuild=true` only exists for sandboxes without NuGet access; you do not need it.)

### Route 2: your own Postgres, like production
```
docker run -d --name ct-pg -e POSTGRES_DB=cubetrainer -e POSTGRES_USER=cube -e POSTGRES_PASSWORD=cube -p 5432:5432 postgres:18-alpine
docker run --rm --network host -v "$PWD/db/migrations:/flyway/sql:ro" flyway/flyway:13-alpine \
  -url=jdbc:postgresql://localhost:5432/cubetrainer -user=cube -password=cube -locations=filesystem:/flyway/sql migrate

cd api/src/CubeTrainer.Api
ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:8080 \
ConnectionStrings__Postgres="Host=localhost;Database=cubetrainer;Username=cube;Password=cube" dotnet run
```
The schema changes **only** through `db/migrations` (Flyway). The API never creates tables; `/health/ready` reports unhealthy until the migrations ran.
Add a migration as `db/migrations/V<next>__what_it_does.sql`, re-run the Flyway command, restart the API.

### Route 3: everything in Docker
```
cp .env.example .env            # optional: keys, social login, Postgres password
docker compose -f infra/docker-compose.yml up --build
```
Open http://localhost:8080. Postgres, Flyway, API and the web app start in that order. Confirmation emails appear in `docker compose -f infra/docker-compose.yml logs -f api`.
Data lives in the `pgdata` volume (`docker compose ... down -v` wipes it).

### Configuration you may want locally
All settings are ASP.NET Core configuration: environment variables use `__` for nesting (`Auth__MinimumAge=18`).

| Setting | Local default | Notes |
|---|---|---|
| `ConnectionStrings__Postgres` or `DATABASE_URL` | empty = in-memory store | `DATABASE_URL` accepts the `postgresql://...` form Neon gives you |
| `Jwt__SigningKey` | dev key (Development only) | required in Production: `openssl rand -base64 64` |
| `Totp__EncryptionKey` | dev key (Development only) | required in Production: `openssl rand -base64 32` |
| `Email__Provider` | `Log` | prints emails; `Brevo` + `Email__BrevoApiKey` + `Email__FromAddress` sends them |
| `Auth__CheckBreachedPasswords` | `true` | set `false` offline (calls the Have I Been Pwned range API) |
| `Auth__MinimumAge` | `13` | see the age note below |
| `Web__BaseUrl` | `http://localhost:4200` | used in email links |
| `Cors__Origins__0` / `CORS_ORIGINS` | `http://localhost:4200` | allowed browser origins |
| `ExternalAuth__Providers__<google\|microsoft\|github\|facebook>__ClientId/ClientSecret` | off | a button appears once both are set; redirect URL `http://localhost:4200/api/v1/auth/external/<provider>/callback` |
| `RateLimiting__AuthPermitPerMinute` | `20` | raise it for automated tests |
| `Leaderboards__RefreshMinutes` | `10` | how often leaderboard results are rebuilt (0 = off; your own results still refresh when you open the page) |
| `Retention__TombstoneDays` | `90` | how long deleted solves are remembered so other devices can learn of the delete |

Two-step verification needs no setup locally: Settings -> Two-step verification shows a QR code; any authenticator app works.

The web app also works without the API: solves stay in the browser and sync once you sign in.

### Tests
```
cd web && npm test                                  # cube engine, stats, plan, sync logic (Node >= 22.18)
cd web && npm run lint && npm run format:check      # what CI checks
dotnet test api/CubeTrainer.sln                     # unit + integration; set DATABASE_URL to run against Postgres
```

## Production (multiple SaaS platforms)

| Concern | Service | Why |
|---|---|---|
| Source + CI/CD | **GitHub** + Actions | build, test, run Flyway on the production DB, then trigger the API deploy |
| Database | **Neon** (Postgres) | serverless Postgres; Flyway migrates it from CI |
| API | **Render** (Docker web service) | runs `api/Dockerfile` |
| Web app | **Cloudflare** (Workers static assets) | static Angular build, global CDN, installable PWA; configured by `web/wrangler.jsonc` |
| Email | **Brevo** | confirmation, password reset and security notices, sent from your own domain |
| DNS / domain | your registrar or **Cloudflare DNS** | web host -> Cloudflare, API host -> Render, Brevo SPF/DKIM/DMARC records |
| Sign-in providers (optional) | Google, Microsoft, GitHub, Facebook developer consoles | OAuth client id + secret per provider |

```
browser --> Cloudflare (cubetrainer.ska97homelab.uk)
   |             |
   |             +--> /config.json tells the app where the API is
   +--> Render API (cubetrainer-api.ska97homelab.uk) --> Neon Postgres
                         +--> Brevo (email)       +--> OAuth providers
GitHub Actions: build/test -> Flyway on Neon -> Render deploy hook
```
The step-by-step production runbook (with account details and secrets handling) is deliberately **not** kept in this public repository.
`.env.example` and `render.yaml` list the variables for local Docker and the Render Blueprint; secret values are only ever entered in the Render, Cloudflare and GitHub dashboards.
`render.yaml` uses `sync: false` for every secret, so none is stored here.

## Regenerating the algorithm data
`web/public/algs/algs.json` and the case pictures come from the J-Perm pages you saved:
```
python3 tools/build_algs.py "<folder with the saved *.html>" data
cp data/algs.json web/public/algs/ && cp -r data/img web/public/algs/
```

## Layout
```
web/     Angular app (src/app/core = cube engine, stats, storage; pages/; shared/), tests in web/tests
api/     ASP.NET Core 10 (.NET 10 LTS), layers: Domain / Application / Infrastructure / Api (+ tests/)
db/      Flyway migrations (the only way the schema changes)
infra/   docker-compose (db + flyway + api + web)
mobile/  Capacitor Android project (Phase 7)
docs/    ARCHITECTURE.md, adr/
tools/   J-Perm HTML -> algs.json
```

## API
Everything is under `/api/v1`: `GET/POST /solves`, `POST /solves/bulk`, `PATCH /solves/{id}` (penalty, tags), `DELETE /solves/{id}`, `DELETE /solves?mode=`, `GET /stats?mode=&caseId=&from=&to=&cube=&method=&stage=`, `GET /cases/stats`, `GET /cases/status`, `PUT /cases/{id}/status`, `GET /summary?tz=`, `GET /me/export`.
Health: `/health/live`, `/health/ready`. Errors are RFC 9457 `application/problem+json`. OpenAPI document at `/openapi/v1.json` in Development (full build).
The schema comes only from `db/migrations` (Flyway); see `docs/ARCHITECTURE.md`.

## Orientation ("how to hold the solved cube")

A scramble only names faces. Timer and Trainer therefore show a panel such as
*"Top white · Front green · right red"*: hold a **solved** cube that way, then apply the scramble. The net
drawing uses the same colours. Timer default = WCA standard (white top, green front). Trainer default =
white cross on the bottom, red in front, as in the F2L PDF (case pictures: green on the right).

## More training sets

| Set | What | How it is verified |
|---|---|---|
| F2L Basic / Advanced / Expert (138 cases) | from `Best_F2L_Algorithms.pdf`; all alternative algorithms per case are listed | `tools/build_f2l.mjs`: alternatives must solve the case state (cross + slots) |
| F2L: several pairs | 3-4 pairs at once, built from chained F2L algorithms | cross must stay solved |
| Beginner method | layer-2 edges, yellow cross, corners, edge placement | each alg must solve its own scramble |
| Last layer: OLL + PLL | one OLL then one PLL per scramble | F2L must stay solved |

Rebuild: `python3 tools/extract_f2l.py <pdf> f2l_raw.json`, `node tools/build_f2l.mjs f2l_raw.json data/algs.json --write`,
`node tools/build_extra.mjs data/algs.json --write`, then copy `data/algs.json` to `web/public/algs/`.
F2L cases do not use the random-AUF option (it would move the pair out of its slot picture).


## Auto-learning, daily plan and the rest

* **Auto-learning** (`web/src/app/core/learning.ts`): a case becomes *finished* when the mean of its last 5 solves is at
  or under the set's target (editable per set; defaults are in `DEFAULT_TARGETS`), none is a DNF, the slowest is under
  1.6x the target, and they come from at least 2 different days. It drops back to *learning* after slow solves
  (mean of the last 3 over 1.6x the target, or a DNF in the last 2). Switch it off with the "Auto-learning" checkbox.
* **Today** page (`core/plan.ts`): spaced repetition. Boxes 0-5 give rest intervals of 0/1/3/7/14/30 days;
  the plan is built from the state at the start of the day. "Start today's plan" runs the Trainer in plan mode.
* **Drill**: recognition practice (top view for OLL/PLL/COLL, grey non-top stickers for OLL), weighted towards cases you miss.
* **Cross** page: optimal cross solver for any colour (BFS over the 4 cross edges) and a comparison of all six colours.
* **Progress**: streak, 14-day chart, per-case heatmap against the target, stage table, mistake counts.
* **Stages and mistake tags**: Timer "Practising" selector (full / cross / F2L / OLL / PLL / last layer) and tags on each solve.
* **Offline / install**: `web/public/sw.js` + `manifest.webmanifest`.
* **Life OS**: `GET /api/v1/summary?tz=330` returns solves today, streak, last 7 days, best today and case status counts.
* **Deployment** (Neon + Render + Cloudflare): `render.yaml`, `web/wrangler.jsonc`, `.github/workflows/`.

Tests: `cd web && npm test` (Node >= 22.18).

## Phase 3: your data, on every device (done)

Solves and case status are per account. Signed in, the app keeps a local copy that works offline and syncs through an outbox
(push, then pull changes after a cursor), so edits and deletes show up on your other devices. Guests keep everything on the
device and are offered to add it to their account at sign-in. Sign in with Google, Microsoft, GitHub or Facebook (each button
appears once its keys are configured on the API). See ADR 0005.

## Phase 1: accounts (done)

Register with email confirmation, sign in (JWT + rotating refresh cookie), forgot/reset password, change password,
active sessions, sign out everywhere, profile and account deletion. Guest mode still works.

## Terms and Privacy Policy

Real text (not placeholders) in `web/src/app/features/legal/legal-text.ts`, written to match what the app actually stores. Sign-up (and the social "finish your profile" step) shows an **I agree**
box whose Terms / Privacy links open the text in a dialog with an **I agree** button; the accepted version and time are stored with the account (`Auth:TermsVersion`, bump it together with `LEGAL_VERSION`
in that file when the text changes). Footer links on every page. Set `CONTACT_EMAIL` and `OPERATOR_NAME` at build time. It is still wise to have a lawyer read it before a public launch (age 13 vs India's DPDP Act parental-consent rule for under-18s).

## Phase 9: social login in the Android app (done)

"Continue with Google/..." opens the phone's browser and returns to the app through `cubetrainer://auth/...`; the app collects the session with a one-time code and a secret it kept (ADR 0013).
No new provider settings. Needs the new app build (the deep-link entry is in the manifest), so install the next release once by hand if the in-app updater is not set up yet.

## Phase 7: Android app (done, sideload)

A Capacitor wrapper around the same Angular app: offline-first, installable as an APK. Build it in GitHub: **Actions -> Android APK -> Run workflow**
(needs the repository variable `API_BASE_URL`), then download the `cubetrainer-apk-*` artifact, copy it to the phone and install it
("install unknown apps" must be allowed). Also add `https://localhost` to the API's `CORS_ORIGINS`. Email/password sign-in, 2FA and social login (through the phone's browser, ADR 0013) work in the app;
connecting providers in Settings does not yet. Details and local build steps: `mobile/README.md`, ADR 0011.

**Updates without an app store (Phase 8):** push a tag like `android-v1.1.0` and the workflow publishes a signed APK as a GitHub Release with a changelog.
Installed apps find it (Updates in the menu, or the banner at launch), show what changed and install it on one tap. Needs the signing secrets (`ANDROID_KEYSTORE_*`) and a public repo; see ADR 0012.

## Phase 6: leaderboards (done)

Opt in on the Leaderboards page or in Settings. Best single / Ao5 / Ao12, all time or last 30 days, filter by country and method. Only opted-in people appear
(username, country, method). Results are self-reported, so treat the boards as friendly competition; see ADR 0010 for the limits.
`GET /api/v1/leaderboards/{single|ao5|ao12}?period=all|30d&country=&method=&limit=` (public), `GET /api/v1/leaderboards/me` (signed in).

## Phase 5: privacy and housekeeping (done)

Settings -> Your data -> **Download my data** (`GET /me/export`: profile, solves, case progress, linked accounts; no secrets). Deleted solves are purged for good after
`Retention__TombstoneDays` (default 90). See ADR 0009.

## Phase 4: filtered personal stats (done)

Solves remember the cube and method from your profile. History and Progress have a filter bar (period, cube, method); `GET /stats` accepts
`from`, `to`, `cube`, `method`, `stage`. See ADR 0008. Change your main cube in Settings and new solves are labeled with it.

## Phase 2: two-step verification (done)

Optional authenticator-app (TOTP, RFC 6238) 2FA: set up with a QR code in Settings, 10 single-use recovery codes, new codes on demand, turn off with password + code. It also gates social sign-in. See ADR 0007.

### Age note
Cubing itself suits roughly 6+, a guided 3x3 solve about 7-8+, and the timer/averages/spaced-repetition mechanics make sense around 8-10.
Accounts and leaderboards are a privacy question: 13 (COPPA, GDPR-K 13-16), and under India's DPDP Act, parental consent under 18.
**Decision (October 2026): minimum age 13**, self-declared at sign-up (`Auth:MinimumAge`, default 13); younger children can use guest mode.
Under India's DPDP Act, people under 18 need verifiable parental consent, which this app does not implement yet. The 13 policy is the owner's current
decision and should be confirmed by a lawyer together with the Terms and Privacy pages before a public launch. Raising it is one setting.
