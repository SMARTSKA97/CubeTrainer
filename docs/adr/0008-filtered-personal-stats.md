# ADR 0008: Filtered personal stats

Accepted.

* **What is recorded:** each solve carries the `cube` and `method` that were in the player's profile when it was made (free text, max 48 characters,
  nullable). Stamping at write time means changing your main cube later does not rewrite history. Solves from before V6 stay unlabeled and only
  appear under "All".
* **Where filtering happens:** the web app computes its numbers locally (it is offline-first), so the filter (period, cube, method) is a pure function
  over the local list (`domain/solve-filter.ts`, covered by Node tests) shared by History and Progress. The filter is held in memory, not saved.
* **API:** `GET /stats` also accepts `from`, `to` (epoch ms, inclusive), `cube`, `method` and `stage`, for other clients such as Life OS. A reversed
  range is a 400. Cube/method match case-insensitively.
* **Not filtered on purpose:** streak, solves-today and the 14-day chart on Progress are about the daily habit, not performance, so they always
  count everything.
* **Not yet:** a per-solve cube picker on the timer (today the profile value is used), editing the label of old solves, leaderboards (Phase 6), which
  will use the same fields.
