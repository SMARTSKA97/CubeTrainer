# Architecture

```
web/      Angular 20 app (later wrapped by Capacitor for Android, see /mobile)
api/      ASP.NET Core 10 (.NET 10 LTS), layered
  src/CubeTrainer.Domain          entities and vocabulary, no dependencies
  src/CubeTrainer.Application     use cases, validation, Result<T>, repository interfaces
  src/CubeTrainer.Infrastructure  EF Core / Npgsql mapping, repositories, connection strings
  src/CubeTrainer.Api             HTTP only: endpoints per feature, contracts, middleware, hosting
  tests/                          unit + integration (WebApplicationFactory, real Postgres in CI)
db/       Flyway migrations: the ONLY thing that changes the schema
infra/    docker-compose (db, flyway, api, web)
mobile/   Capacitor project (Phase 7)
docs/     this file, ADRs
```

Dependencies point inwards: Api -> Infrastructure -> Application -> Domain. Application never sees EF Core or HTTP
types (other than DI abstractions), so use cases are unit-testable with in-memory repositories.

## Request path
Client -> `/api/v1/...` -> exception handler (RFC 9457 ProblemDetails) -> security headers -> CORS -> rate limiter ->
endpoint -> use-case service -> repository -> Postgres.

## Cross-cutting
* **Errors**: use cases return `Result<T>` with a stable `code`; the API maps them to `application/problem+json`
  (`code`, `traceId`; `error` mirrors `detail` for older clients).
* **Health**: `/health/live` (process up) and `/health/ready` (database reachable AND Flyway history present).
* **Rate limiting**: per-IP fixed window (`RateLimiting:PermitPerMinute`, default 300). Auth endpoints get stricter policies in Phase 1.
* **Logging**: JSON lines to stdout outside Development.
* **Config**: environment variables win (`DATABASE_URL`, `CORS_ORIGINS`, `PORT`, `Proxy__TrustForwardedHeaders`, `Persistence__AllowInMemory`).
* **Versioning**: URL-versioned (`/api/v1`); breaking changes ship as `/api/v2` next to v1.

## Database rules
1. Schema changes are new files in `db/migrations` (`V<n>__description.sql`). Applied files are never edited.
2. Migrations are backward compatible with the previous API release (expand, then contract in a later release),
   because CI migrates before the API is deployed.
3. EF Core only maps tables. No `EnsureCreated`, no EF migrations. The runtime role (`cubetrainer_app`) has DML rights only.
4. Production refuses to start without a database unless `Persistence:AllowInMemory=true`.

## Build flags
`dotnet build -p:OfflineBuild=true` skips every NuGet package (Npgsql, Swagger) and uses the in-memory repositories.
It exists for sandboxes without package access; CI and Docker always build the full version.
