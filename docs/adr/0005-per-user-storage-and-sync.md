# ADR 0005: Per-user storage and delta sync

Accepted.

## Context
Solves were one shared pool with no owner. Accounts exist now, and users want their history on several devices, offline.

## Decision
* **Ownership:** `solves` and `case_status` carry `user_id`, with composite primary keys `(user_id, id)`. A client-chosen id can never
  collide with, read or overwrite another user's row. All solve/stats/summary endpoints require a bearer token and every
  repository method takes the user id. The old shared tables are renamed `legacy_*`, not dropped.
* **Change numbers:** each write gets a `rev` from one sequence, assigned by a database trigger, so the app cannot forget it.
  `GET /sync/changes?since=N` returns rows with `rev > N` (paged, with a cursor) including **tombstones** (`deleted_at`).
  Case statuses ride on the same cursor.
* **Deletes win:** re-uploading a solve whose row is a tombstone is ignored, so a stale device cannot bring it back.
* **Client:** localStorage holds a per-account copy plus an outbox of unsent changes. Sync = push the outbox in order, then pull.
  Rows with queued local changes are not overwritten by pulled data. Temporary failures (offline, 5xx, 429, 401) keep the change
  queued; permanent ones (other 4xx) drop it so the queue never blocks.
* **Conflicts:** last writer wins per solve. Solves are almost immutable (only penalty, tags and delete change), so this is enough.
* **Guests:** nothing is sent to the server. At sign-in the app offers to add the device's guest solves to the account.
* **Shared devices:** signing out removes the account's local copy unless it still has unsent changes.

## Consequences
Cursors assume one writer per user at a time is the common case; a transaction that commits late could carry a lower `rev` than
one that committed earlier, and a pull in between would skip it until the next change. For one person's solves this window is tiny;
if it ever matters, pull with a small overlap (`since - 1000`) since upserts are idempotent.
