# ADR 0010: Leaderboards

Accepted.

* **Who appears:** only people who switched on `leaderboard_opt_in` and have a confirmed email, decided **at query time**, so opting out hides someone
  immediately. The board shows username, country, method and result; never email or real name. Minimum age (13) applies as for every account.
* **What counts:** full random-scramble solves only (not stage drills or case training). Best single, Ao5 and Ao12 (WCA trimmed mean, one DNF allowed
  in an average), all time and last 30 days. Filters: country and method, both taken from the profile.
* **How it is computed:** a background job (`Leaderboards__RefreshMinutes`, default 10, 0 = off) rebuilds `leaderboard_entries` for opted-in people from
  their solves. A person's own results are also refreshed on demand when they open the page (`GET /leaderboards/me`), so joining feels instant.
  Boards are plain indexed reads; ties share a rank, earlier result listed first.
* **Integrity, honestly:** solves are recorded by the client and are **not independently verifiable**. Mitigations are modest: results under 3.00 s are ignored
  (any average window containing one is skipped), rate limits, and the opt-in. A determined cheater can still post a fake 8-second solve. Real anti-cheat
  (signed timer sessions, scramble issued by the server, moderation and reporting) is a later phase if the boards get attention.
* **Public reads:** `GET /leaderboards/{metric}` is anonymous and rate limited; `no-cache` so changes show up immediately.
* **Scale:** the refresh job is O(people x solves). Fine for thousands of people; beyond that, refresh only people whose solves changed (use `rev`).
* **Not yet:** per-cube boards, friends/clubs, history of ranks, reporting a suspicious result.
