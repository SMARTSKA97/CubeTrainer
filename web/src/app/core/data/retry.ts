import { Injectable, signal } from '@angular/core';
import { SolveMode } from '@domain/stats';

export interface PendingRetry {
  mode: SolveMode;
  scramble: string;
  setId?: string;
  caseId?: string;
  auf?: number;
}

/** Hands a scramble from the History page back to the Timer / Trainer so it can be solved again. */
@Injectable({ providedIn: 'root' })
export class RetryService {
  private readonly pending = signal<PendingRetry | null>(null);

  set(p: PendingRetry) {
    this.pending.set(p);
  }

  /** Returns the pending retry once, only if it is for the given mode. */
  take(mode: SolveMode): PendingRetry | null {
    const p = this.pending();
    if (p && p.mode === mode) {
      this.pending.set(null);
      return p;
    }
    return null;
  }
}
