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

## Run

### Everything with Docker
```
docker compose -f infra/docker-compose.yml up --build
```
Open http://localhost:8080. Data lives in the `pgdata` volume. Set `POSTGRES_PASSWORD` in a `.env` file to change the default.

### Development
```
# API  (in-memory, nothing to install):
cd api/src/CubeTrainer.Api && dotnet run -p:OfflineBuild=true     # OfflineBuild skips NuGet-only parts (Postgres, OpenAPI)
# API against Postgres (apply db/migrations with Flyway first; infra/docker-compose.yml does it for you):
ConnectionStrings__Postgres="Host=localhost;Database=cubetrainer;Username=cube;Password=cube" dotnet run

# Front end (proxies /api to http://localhost:8080):
cd web && npm install && npm start
```
The front end works without the API too: solves are kept in the browser (localStorage) and are pushed to the server the next time the API is reachable. The badge in the header shows which mode you are in.

### Tests
```
cd web && npm test                                  # cube engine, stats, plan, cross solver (Node >= 22.18)
dotnet test api/CubeTrainer.sln                     # unit + integration (DATABASE_URL set = against Postgres)
```

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
Everything is under `/api/v1`: `GET/POST /solves`, `POST /solves/bulk`, `PATCH /solves/{id}` (penalty, tags), `DELETE /solves/{id}`, `DELETE /solves?mode=`, `GET /stats?mode=&caseId=`, `GET /cases/stats`, `GET /cases/status`, `PUT /cases/{id}/status`, `GET /summary?tz=`.
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
* **Deployment** (Neon + Render + Cloudflare Pages): see `DEPLOY.md`.

Tests: `cd web && npm test` (Node >= 22.18).
