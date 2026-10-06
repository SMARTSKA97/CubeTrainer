# ADR 0002: Flyway owns the schema, EF Core only maps
Status: accepted

Plain SQL migrations are reviewable, reversible by a new migration, runnable from CI against Neon before the API
deploys, and independent of the .NET toolchain (the Android and web clients never touch them). EF migrations and
`EnsureCreated` are disabled by design. The API connects as a role without DDL rights so a bug or injection cannot alter tables.
