/**
 * Pure rules for syncing with the server (no Angular imports, so Node can test them).
 *
 * Model: the device keeps a full local copy (works offline) and an "outbox" of changes the server has not seen yet.
 * Sync = push the outbox in order, then pull everything that changed on the server after our cursor.
 * A change we still have queued always wins over what we pull for the same row.
 */
import type { CaseStatus, Penalty, Solve } from '@domain/stats';

export type Op =
  | { k: 'put'; solve: Solve }
  | { k: 'patch'; id: string; penalty?: Penalty; tags?: string[] }
  | { k: 'del'; id: string }
  | { k: 'clear'; mode?: 'random' | 'case' }
  | { k: 'status'; caseId: string; status: CaseStatus };

/** Adds a change to the outbox, folding it into earlier queued changes where that is safe. */
export function enqueue(ops: readonly Op[], op: Op): Op[] {
  switch (op.k) {
    case 'put':
      return [...ops.filter((o) => !(o.k === 'put' && o.solve.id === op.solve.id)), op];
    case 'patch': {
      const put = ops.findIndex((o) => o.k === 'put' && o.solve.id === op.id);
      if (put >= 0) {
        const next = [...ops];
        const prev = next[put] as Extract<Op, { k: 'put' }>;
        next[put] = {
          k: 'put',
          solve: {
            ...prev.solve,
            ...(op.penalty ? { penalty: op.penalty } : {}),
            ...(op.tags ? { tags: op.tags } : {}),
          },
        };
        return next;
      }
      const patch = ops.findIndex((o) => o.k === 'patch' && o.id === op.id);
      if (patch >= 0) {
        const next = [...ops];
        const prev = next[patch] as Extract<Op, { k: 'patch' }>;
        next[patch] = {
          ...prev,
          ...(op.penalty ? { penalty: op.penalty } : {}),
          ...(op.tags ? { tags: op.tags } : {}),
        };
        return next;
      }
      return [...ops, op];
    }
    case 'del':
      // Earlier uploads/edits of this solve are pointless now; the delete itself is always sent (404 is fine).
      return [
        ...ops.filter(
          (o) => !((o.k === 'put' && o.solve.id === op.id) || (o.k === 'patch' && o.id === op.id)),
        ),
        op,
      ];
    case 'status':
      return [...ops.filter((o) => !(o.k === 'status' && o.caseId === op.caseId)), op];
    default:
      return [...ops, op];
  }
}

/** Solve ids and case ids with a queued change: pulled server data must not overwrite these. */
export function pendingKeys(ops: readonly Op[]): {
  solves: Set<string>;
  cases: Set<string>;
  clearAll: boolean;
} {
  const solves = new Set<string>();
  const cases = new Set<string>();
  let clearAll = false;
  for (const o of ops) {
    if (o.k === 'put') solves.add(o.solve.id);
    else if (o.k === 'patch' || o.k === 'del') solves.add(o.id);
    else if (o.k === 'status') cases.add(o.caseId);
    else clearAll = true;
  }
  return { solves, cases, clearAll };
}

/** What the API sends for one solve in a sync page. */
export interface RemoteSolve extends Omit<
  Solve,
  'setId' | 'caseId' | 'auf' | 'inspectionMs' | 'stage' | 'tags'
> {
  setId?: string | null;
  caseId?: string | null;
  auf?: number | null;
  inspectionMs?: number | null;
  stage?: Solve['stage'] | null;
  tags?: string[] | null;
  rev: number;
  deleted: boolean;
}

/** Server nulls become missing fields, and server-only fields are dropped. */
export function fromRemote(r: RemoteSolve): Solve {
  const s: Solve = {
    id: r.id,
    at: r.at,
    timeMs: r.timeMs,
    penalty: r.penalty,
    scramble: r.scramble,
    mode: r.mode,
  };
  if (r.setId) s.setId = r.setId;
  if (r.caseId) s.caseId = r.caseId;
  if (r.auf !== null && r.auf !== undefined) s.auf = r.auf;
  if (r.inspectionMs !== null && r.inspectionMs !== undefined) s.inspectionMs = r.inspectionMs;
  if (r.stage) s.stage = r.stage;
  if (r.tags) s.tags = r.tags;
  return s;
}

/** Applies a page of server changes (edits and tombstones) to the local list. */
export function mergeRemoteSolves(
  local: readonly Solve[],
  changes: readonly RemoteSolve[],
  skip: ReadonlySet<string>,
): Solve[] {
  const byId = new Map(local.map((s) => [s.id, s]));
  for (const c of changes) {
    if (skip.has(c.id)) continue;
    if (c.deleted) byId.delete(c.id);
    else byId.set(c.id, fromRemote(c));
  }
  return [...byId.values()];
}

export function mergeRemoteStatuses(
  local: Readonly<Record<string, CaseStatus>>,
  changes: readonly { caseId: string; status: CaseStatus }[],
  skip: ReadonlySet<string>,
): Record<string, CaseStatus> {
  const next = { ...local };
  for (const c of changes) if (!skip.has(c.caseId)) next[c.caseId] = c.status;
  return next;
}

/** Whether a failed request should stay in the outbox (try again later) or be dropped (the server will never accept it). */
export function isRetryable(status: number): boolean {
  return (
    status === 0 ||
    status === 401 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}
