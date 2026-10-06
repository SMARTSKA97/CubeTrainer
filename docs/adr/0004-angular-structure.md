# ADR 0004: Angular structure and conventions

Accepted. Angular 22, standalone components, zoneless change detection, OnPush everywhere, signals for state.

* `core/` app-wide singletons (API client, auth store, interceptor, guards); `domain/` pure TypeScript with no Angular imports
  (unit-tested in Node); `shared/` reusable presentational pieces; `features/<name>/` lazy routes (`loadComponent`).
* Path aliases `@core/* @domain/* @shared/* @features/*`.
* The access token lives in memory only; the refresh token is an HttpOnly cookie (web) so XSS cannot read it.
* Typed reactive forms; async validators for server-checked rules (username availability).
