import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiBase } from '@core/config';
import type { CaseStatus, Penalty, Solve } from '@domain/stats';
import type { RemoteSolve } from './sync-logic';

export interface SyncPage {
  cursor: number;
  hasMore: boolean;
  solves: RemoteSolve[];
  caseStatuses: { caseId: string; status: CaseStatus; rev: number }[];
}

/** Typed calls for the signed-in user's solves. Auth headers come from the interceptor. */
@Injectable({ providedIn: 'root' })
export class SyncApi {
  private readonly http = inject(HttpClient);
  private url = (p: string) => `${apiBase()}${p}`;

  changes(since: number, limit = 1000): Observable<SyncPage> {
    return this.http.get<SyncPage>(this.url('/sync/changes'), { params: { since, limit } });
  }

  putMany(solves: Solve[]): Observable<{ saved: number }> {
    return this.http.post<{ saved: number }>(this.url('/solves/bulk'), solves);
  }

  patch(id: string, body: { penalty?: Penalty; tags?: string[] }): Observable<void> {
    return this.http.patch<void>(this.url(`/solves/${id}`), body);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(this.url(`/solves/${id}`));
  }

  clear(mode?: 'random' | 'case'): Observable<unknown> {
    return this.http.delete(this.url('/solves'), { params: mode ? { mode } : {} });
  }

  setStatus(caseId: string, status: CaseStatus): Observable<void> {
    return this.http.put<void>(this.url(`/cases/${encodeURIComponent(caseId)}/status`), { status });
  }
}
