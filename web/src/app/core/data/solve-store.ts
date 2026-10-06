import { Injectable, computed, signal } from '@angular/core';
import { CaseStatus, Penalty, Solve } from '@domain/stats';
import { LearningSettings } from './learning-settings';
import { evaluateCase } from '@domain/learning';
import { inject } from '@angular/core';
import { apiBase } from '@core/config';

const LS_SOLVES = 'cubetrainer.solves.v1';
const LS_STATUS = 'cubetrainer.status.v1';

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
 * Everything is saved in localStorage first, so the app works offline and without the API. When the
 * API answers, the same data is mirrored to PostgreSQL and any solves that only exist locally are
 * pushed up on start-up.
 */
@Injectable({ providedIn: 'root' })
export class SolveStore {
  private readonly _solves = signal<Solve[]>(this.readLocal<Solve[]>(LS_SOLVES, []));
  private readonly _status = signal<Record<string, CaseStatus>>(this.readLocal(LS_STATUS, {}));
  readonly backend = signal<'checking' | 'api' | 'local'>('checking');
  private readonly learning = inject(LearningSettings);
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
    void this.connect();
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
    const full: Solve = { ...solve, id: newId(), at: Date.now() };
    this._solves.update((l) => [...l, full]);
    this.saveLocal();
    void this.send('POST', `${apiBase()}/solves`, full);
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
        tags: raw.tags,
      });
    }
    if (fresh.length) {
      this._solves.update((l) => [...l, ...fresh]);
      this.saveLocal();
      if (this.backend() === 'api') void this.send('POST', `${apiBase()}/solves/bulk`, fresh);
      for (const caseId of new Set(
        fresh.filter((s) => s.mode === 'case' && s.caseId).map((s) => s.caseId!),
      ))
        this.reevaluate(caseId);
    }
    return fresh.length;
  }

  async setPenalty(id: string, penalty: Penalty) {
    this._solves.update((l) => l.map((s) => (s.id === id ? { ...s, penalty } : s)));
    this.saveLocal();
    void this.send('PATCH', `${apiBase()}/solves/${id}`, { penalty });
  }

  async setTags(id: string, tags: string[]) {
    this._solves.update((l) => l.map((s) => (s.id === id ? { ...s, tags } : s)));
    this.saveLocal();
    void this.send('PATCH', `${apiBase()}/solves/${id}`, { tags });
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
    this.saveLocal();
    void this.send('DELETE', `${apiBase()}/solves/${id}`);
  }

  async clear(mode?: 'random' | 'case') {
    this._solves.update((l) => (mode ? l.filter((s) => s.mode !== mode) : []));
    this.saveLocal();
    void this.send('DELETE', `${apiBase()}/solves${mode ? `?mode=${mode}` : ''}`);
  }

  setStatus(caseId: string, status: CaseStatus) {
    this._status.update((m) => ({ ...m, [caseId]: status }));
    localStorage.setItem(LS_STATUS, JSON.stringify(this._status()));
    void this.send('PUT', `${apiBase()}/cases/${encodeURIComponent(caseId)}/status`, { status });
  }

  statusOf(caseId: string): CaseStatus {
    return this._status()[caseId] ?? 'unlearned';
  }

  // ------------------------------------------------------------------ plumbing

  private retries = 0;

  /**
   * Talk to the API. A free Render service sleeps when idle and needs up to ~a minute to wake, so the
   * first request gets a long timeout; meanwhile everything works from localStorage and is pushed later.
   */
  private async connect() {
    try {
      const res = await fetch(`${apiBase()}/solves`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(75000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const remote = (await res.json()) as Solve[];
      const remoteIds = new Set(remote.map((r) => r.id));
      const localOnly = this._solves().filter((s) => !remoteIds.has(s.id));
      if (localOnly.length) {
        await fetch(`${apiBase()}/solves/bulk`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(localOnly),
        });
      }
      this._solves.set([...remote, ...localOnly]);
      this.saveLocal();

      const sres = await fetch(`${apiBase()}/cases/status`);
      if (sres.ok) {
        const remoteStatus = (await sres.json()) as Record<string, CaseStatus>;
        this._status.set({ ...remoteStatus, ...this._status() });
      }
      this.backend.set('api');
    } catch {
      this.backend.set('local');
      if (this.retries++ < 5) setTimeout(() => void this.connect(), 30000);
    }
  }

  private async send(method: string, url: string, body?: unknown) {
    if (this.backend() !== 'api') return;
    try {
      await fetch(url, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // The local copy is authoritative; the next start-up sync pushes anything missed.
    }
  }

  private saveLocal() {
    localStorage.setItem(LS_SOLVES, JSON.stringify(this._solves()));
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
