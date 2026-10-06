import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CaseStatus, Penalty, Solve } from '@domain/stats';
import { LearningSettings } from './learning-settings';
import { evaluateCase } from '@domain/learning';
import { AuthStore } from '@core/auth/auth-store';
import { SyncApi } from './sync-api';
import {
  Op,
  enqueue,
  isRetryable,
  mergeRemoteSolves,
  mergeRemoteStatuses,
  pendingKeys,
} from './sync-logic';

interface Slot {
  solves: string;
  status: string;
  outbox: string;
  cursor: string;
}

/** Guests keep the original keys; every account gets its own set, so people sharing a device never see each other's data. */
const GUEST: Slot = {
  solves: 'cubetrainer.solves.v1',
  status: 'cubetrainer.status.v1',
  outbox: '',
  cursor: '',
};
const slotFor = (userId: string): Slot => ({
  solves: `cubetrainer.u.${userId}.solves`,
  status: `cubetrainer.u.${userId}.status`,
  outbox: `cubetrainer.u.${userId}.outbox`,
  cursor: `cubetrainer.u.${userId}.cursor`,
});
const dismissKey = (userId: string) => `cubetrainer.u.${userId}.guestImportDismissed`;

export type SyncState = 'guest' | 'syncing' | 'synced' | 'offline' | 'error';

/** crypto.randomUUID only exists in secure contexts (https / localhost); fall back for http://192.168.x.x on a phone. */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Solve history and per-case learning status.
 *
 * Guests: everything lives in localStorage on this device.
 * Signed in: localStorage is a per-account offline copy. Changes go into an outbox and are pushed to the API
 * (in order, retried until accepted); then everything that changed on the server since our cursor is pulled,
 * so edits and deletes made on another device show up here. See sync-logic.ts for the rules.
 */
@Injectable({ providedIn: 'root' })
export class SolveStore {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(SyncApi);
  private readonly learning = inject(LearningSettings);

  private slot: Slot = GUEST;
  private owner: string | null = null;
  private outbox: Op[] = [];
  private inflight = 0;
  private cursor = 0;
  private syncing = false;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly _solves = signal<Solve[]>(this.readLocal<Solve[]>(GUEST.solves, []));
  private readonly _status = signal<Record<string, CaseStatus>>(this.readLocal(GUEST.status, {}));
  private readonly _pending = signal(0);

  readonly sync = signal<SyncState>('guest');
  readonly pending = this._pending.asReadonly();
  /** Set after sign-in when this device holds guest solves that are not in the account yet. */
  readonly guestImport = signal<{ count: number } | null>(null);
  /** set when the last solve changed a case status automatically: {caseId, from, to, reason} */
  readonly lastAutoChange = signal<{
    caseId: string;
    from: CaseStatus;
    to: CaseStatus;
    reason: string;
  } | null>(null);

  /** oldest -> newest */
  readonly solves = computed(() => [...this._solves()].sort((a, b) => a.at - b.at));
  readonly status = this._status.asReadonly();

  constructor() {
    effect(() => {
      const id = this.auth.user()?.id ?? null;
      untracked(() => this.activate(id));
    });
    window.addEventListener('online', () => this.requestSync());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.requestSync();
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') this.requestSync();
    }, 60_000);
  }

  // -------------------------------------------------------------------- queries

  randomSolves() {
    return this.solves().filter((s) => s.mode === 'random');
  }

  caseSolves(caseId: string) {
    return this.solves().filter((s) => s.mode === 'case' && s.caseId === caseId);
  }

  // ------------------------------------------------------------------ mutations

  async add(solve: Omit<Solve, 'id' | 'at'>): Promise<Solve> {
    const profile = this.auth.user();
    const full: Solve = {
      ...solve,
      // stamped from the profile so stats can be filtered per cube and method later
      ...stamp(solve.cube ?? profile?.cubeModel, solve.method ?? profile?.cubeMethod),
      id: newId(),
      at: Date.now(),
    };
    this._solves.update((l) => [...l, full]);
    this.saveSolves();
    this.queue({ k: 'put', solve: full });
    if (full.mode === 'case' && full.caseId) this.reevaluate(full.caseId, full.setId);
    return full;
  }

  /** Restore solves from an exported JSON file; solves whose id already exists are skipped. Returns how many were added. */
  async importSolves(list: unknown): Promise<number> {
    if (!Array.isArray(list)) throw new Error('Expected a JSON array of solves.');
    const known = new Set(this._solves().map((s) => s.id));
    const fresh: Solve[] = [];
    for (const raw of list as Partial<Solve>[]) {
      if (
        !raw ||
        typeof raw.timeMs !== 'number' ||
        typeof raw.at !== 'number' ||
        typeof raw.scramble !== 'string'
      )
        continue;
      const id = typeof raw.id === 'string' && raw.id ? raw.id : newId();
      if (known.has(id)) continue;
      known.add(id);
      fresh.push({
        id,
        at: raw.at,
        timeMs: raw.timeMs,
        penalty: raw.penalty === 'plus2' || raw.penalty === 'dnf' ? raw.penalty : 'none',
        scramble: raw.scramble,
        mode: raw.mode === 'case' ? 'case' : 'random',
        setId: raw.setId,
        caseId: raw.caseId,
        auf: raw.auf,
        inspectionMs: raw.inspectionMs,
        stage: raw.stage,
        ...stamp(raw.cube, raw.method),
        tags: raw.tags,
      });
    }
    if (fresh.length) {
      this._solves.update((l) => [...l, ...fresh]);
      this.saveSolves();
      for (const s of fresh) this.queue({ k: 'put', solve: s });
      for (const caseId of new Set(
        fresh.filter((s) => s.mode === 'case' && s.caseId).map((s) => s.caseId!),
      ))
        this.reevaluate(caseId);
    }
    return fresh.length;
  }

  async setPenalty(id: string, penalty: Penalty) {
    this._solves.update((l) => l.map((s) => (s.id === id ? { ...s, penalty } : s)));
    this.saveSolves();
    this.queue({ k: 'patch', id, penalty });
  }

  async setTags(id: string, tags: string[]) {
    this._solves.update((l) => l.map((s) => (s.id === id ? { ...s, tags } : s)));
    this.saveSolves();
    this.queue({ k: 'patch', id, tags });
  }

  /** Recompute a case's status from its timings (auto-learning). Manual changes stay until the next solve. */
  reevaluate(caseId: string, setId?: string) {
    if (!this.learning.auto()) return;
    const solves = this.caseSolves(caseId);
    const sid = setId ?? solves[solves.length - 1]?.setId ?? '';
    const from = this.statusOf(caseId);
    const info = evaluateCase(
      solves,
      this.learning.targetMs(sid),
      from,
      this.learning.rules(),
      new Date().getTimezoneOffset(),
    );
    // never leave 'unlearned' behind once there are solves
    const to =
      from === 'unlearned' && info.status === 'unlearned' && solves.length
        ? 'learning'
        : info.status;
    if (to !== from) {
      this.setStatus(caseId, to);
      this.lastAutoChange.set({ caseId, from, to, reason: info.reason });
    } else {
      this.lastAutoChange.set(null);
    }
  }

  async remove(id: string) {
    this._solves.update((l) => l.filter((s) => s.id !== id));
    this.saveSolves();
    this.queue({ k: 'del', id });
  }

  async clear(mode?: 'random' | 'case') {
    this._solves.update((l) => (mode ? l.filter((s) => s.mode !== mode) : []));
    this.saveSolves();
    this.queue({ k: 'clear', mode });
  }

  setStatus(caseId: string, status: CaseStatus) {
    this._status.update((m) => ({ ...m, [caseId]: status }));
    this.saveStatus();
    this.queue({ k: 'status', caseId, status });
  }

  statusOf(caseId: string): CaseStatus {
    return this._status()[caseId] ?? 'unlearned';
  }

  // ------------------------------------------------------------ guest -> account

  /** Adds the solves recorded on this device as a guest to the signed-in account, then clears the guest copy. */
  acceptGuestImport(): void {
    if (!this.owner) return;
    const guestSolves = this.readLocal<Solve[]>(GUEST.solves, []);
    const guestStatus = this.readLocal<Record<string, CaseStatus>>(GUEST.status, {});
    const known = new Set(this._solves().map((s) => s.id));
    const fresh = guestSolves.filter((s) => !known.has(s.id));
    if (fresh.length) {
      this._solves.update((l) => [...l, ...fresh]);
      this.saveSolves();
      for (const s of fresh) this.queue({ k: 'put', solve: s });
    }
    for (const [caseId, status] of Object.entries(guestStatus))
      if (!(caseId in this._status())) this.setStatus(caseId, status);
    localStorage.removeItem(GUEST.solves);
    localStorage.removeItem(GUEST.status);
    this.guestImport.set(null);
  }

  /** Keep the guest data on this device and stop asking. */
  dismissGuestImport(): void {
    if (this.owner) localStorage.setItem(dismissKey(this.owner), '1');
    this.guestImport.set(null);
  }

  // --------------------------------------------------------------- sync engine

  /** Switch to another account's local copy (or back to the guest copy). */
  private activate(userId: string | null): void {
    if (userId === this.owner) return;
    const previous = this.owner;
    const hadPending = this.outbox.length > 0;
    this.owner = userId;
    clearTimeout(this.timer);
    this.inflight = 0;

    // Signing out on a shared device should not leave the account's data behind, unless it has changes not yet uploaded.
    if (previous && !hadPending)
      for (const k of Object.values(slotFor(previous))) localStorage.removeItem(k);

    this.slot = userId ? slotFor(userId) : GUEST;
    this._solves.set(this.readLocal<Solve[]>(this.slot.solves, []));
    this._status.set(this.readLocal(this.slot.status, {}));
    this.outbox = userId ? this.readLocal<Op[]>(this.slot.outbox, []) : [];
    this.cursor = userId ? this.readLocal<number>(this.slot.cursor, 0) : 0;
    this._pending.set(this.outbox.length);
    this.lastAutoChange.set(null);

    if (!userId) {
      this.sync.set('guest');
      this.guestImport.set(null);
      return;
    }
    const guestCount = this.readLocal<Solve[]>(GUEST.solves, []).length;
    const dismissed = localStorage.getItem(dismissKey(userId)) === '1';
    this.guestImport.set(guestCount > 0 && !dismissed ? { count: guestCount } : null);
    this.sync.set('syncing');
    this.requestSync();
  }

  private queue(op: Op): void {
    if (!this.owner) return; // guests have no server copy
    const head = this.outbox.slice(0, this.inflight); // already being sent: leave untouched
    this.outbox = [...head, ...enqueue(this.outbox.slice(this.inflight), op)];
    this.saveOutbox();
    this.requestSync(400);
  }

  /** Ask for a sync soon. Calls made while one is running are folded into one follow-up run. */
  requestSync(delayMs = 0): void {
    if (!this.owner) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.runSync(), delayMs);
  }

  private async runSync(): Promise<void> {
    const owner = this.owner;
    if (!owner) return;
    if (this.syncing) {
      this.again = true;
      return;
    }
    this.syncing = true;
    this.sync.set('syncing');
    try {
      await this.flush(owner);
      await this.pull(owner);
      if (this.owner === owner) this.sync.set('synced');
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      if (this.owner === owner) this.sync.set(status === 0 ? 'offline' : 'error');
      if (this.owner === owner) this.requestSync(30_000);
    } finally {
      this.syncing = false;
      if (this.again) {
        this.again = false;
        this.requestSync(200);
      }
    }
  }

  /** Sends queued changes in order. Stops (keeping them) on a temporary failure; drops ones the server will never accept. */
  private async flush(owner: string): Promise<void> {
    while (this.owner === owner && this.outbox.length) {
      const first = this.outbox[0];
      let count = 1;
      let request;
      if (first.k === 'put') {
        const puts: Solve[] = [];
        while (
          count <= this.outbox.length &&
          puts.length < 500 &&
          this.outbox[count - 1]?.k === 'put'
        ) {
          puts.push((this.outbox[count - 1] as Extract<Op, { k: 'put' }>).solve);
          count++;
        }
        count -= 1;
        request = this.api.putMany(puts);
      } else if (first.k === 'patch') {
        request = this.api.patch(first.id, { penalty: first.penalty, tags: first.tags });
      } else if (first.k === 'del') {
        request = this.api.remove(first.id);
      } else if (first.k === 'clear') {
        request = this.api.clear(first.mode);
      } else {
        request = this.api.setStatus(first.caseId, first.status);
      }

      this.inflight = count;
      try {
        await firstValueFrom(request);
      } catch (err) {
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        if (isRetryable(status)) {
          this.inflight = 0;
          throw err;
        }
        // 400/404/...: this change can never succeed (e.g. deleting something already gone); do not block the queue.
      }
      this.inflight = 0;
      if (this.owner !== owner) return;
      this.outbox = this.outbox.slice(count);
      this.saveOutbox();
    }
  }

  /** Pulls pages of server changes after our cursor and merges them, leaving rows with queued local changes alone. */
  private async pull(owner: string): Promise<void> {
    for (;;) {
      const page = await firstValueFrom(this.api.changes(this.cursor));
      if (this.owner !== owner) return;
      const keys = pendingKeys(this.outbox);
      if (page.solves.length && !keys.clearAll) {
        this._solves.set(mergeRemoteSolves(this._solves(), page.solves, keys.solves));
        this.saveSolves();
      }
      if (page.caseStatuses.length) {
        this._status.set(mergeRemoteStatuses(this._status(), page.caseStatuses, keys.cases));
        this.saveStatus();
      }
      this.cursor = page.cursor;
      if (this.slot.cursor) localStorage.setItem(this.slot.cursor, String(this.cursor));
      if (!page.hasMore) return;
    }
  }

  // ------------------------------------------------------------------- storage

  private saveSolves() {
    this.write(this.slot.solves, this._solves());
  }

  private saveStatus() {
    this.write(this.slot.status, this._status());
  }

  private saveOutbox() {
    this._pending.set(this.outbox.length);
    if (this.slot.outbox) this.write(this.slot.outbox, this.outbox);
  }

  private write(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked: the in-memory copy still works for this session */
    }
  }

  private readLocal<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }
}

/** Trimmed, non-empty cube/method labels as object spread. */
function stamp(cube?: string | null, method?: string | null): Pick<Solve, 'cube' | 'method'> {
  const out: Pick<Solve, 'cube' | 'method'> = {};
  const c = cube?.trim().slice(0, 48);
  const m = method?.trim().slice(0, 48);
  if (c) out.cube = c;
  if (m) out.method = m;
  return out;
}
