# ADR 0009: Data export and retention

Accepted.

* **Export:** `GET /api/v1/me/export` returns one JSON file (profile, live solves, case statuses, linked accounts) for the signed-in user only. It never
  contains password hashes, tokens or authenticator secrets, and is sent `no-store`. The Settings page has a "Download my data" button. This is the
  person's right to a copy (India's DPDP Act, GDPR).
* **Tombstone purge:** deleting a solve leaves a tombstone so other devices learn about it. The background cleanup job (every 6 h) permanently removes
  tombstones older than `Retention__TombstoneDays` (default 90, allowed 7-3650). Trade-off: a device that stays offline longer than that and still holds
  the solve could upload it again; an owner who cares can raise the value.
* **Account deletion** (Phase 1) already removes everything immediately through foreign-key cascades.
* **Not yet:** a scheduled "inactive account" policy, and an admin-facing audit log.
