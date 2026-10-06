import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiBase } from '@core/config';

export type Metric = 'single' | 'ao5' | 'ao12';
export type Period = 'all' | '30d';

export interface BoardRow {
  rank: number;
  handle: string;
  country: string;
  method: string | null;
  valueMs: number;
  achievedAtMs: number;
}

export interface MyStanding {
  metric: Metric;
  period: Period;
  valueMs: number;
  achievedAtMs: number;
  rank: number | null;
}

export interface MyLeaderboards {
  optedIn: boolean;
  standings: MyStanding[];
}

/** Public boards (anyone) and my own standing (signed in). */
@Injectable({ providedIn: 'root' })
export class LeaderboardApi {
  private readonly http = inject(HttpClient);

  board(
    metric: Metric,
    period: Period,
    country: string,
    method: string,
    limit = 50,
  ): Observable<BoardRow[]> {
    const params: Record<string, string> = { period, limit: String(limit) };
    if (country) params['country'] = country;
    if (method) params['method'] = method;
    return this.http.get<BoardRow[]>(`${apiBase()}/leaderboards/${metric}`, { params });
  }

  mine(): Observable<MyLeaderboards> {
    return this.http.get<MyLeaderboards>(`${apiBase()}/leaderboards/me`);
  }
}
