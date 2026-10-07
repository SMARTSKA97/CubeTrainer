import { Injectable, signal } from '@angular/core';
import { MAX_SAMPLES, meanMs, pushSample } from '@domain/practice';

interface Log {
  /** time from seeing the case to starting the timer (thinking), ms */
  recog: number[];
  /** the solve itself, ms */
  exec: number[];
}

const KEY = 'cubetrainer.recog.v1';

/**
 * Splits each case solve into "thinking" (recognition) and "doing" (execution). Kept on this device
 * only: it never touches the synced solve records.
 */
@Injectable({ providedIn: 'root' })
export class RecogStore {
  private readonly data = signal<Record<string, Log>>(this.read());

  add(caseId: string, recogMs: number, execMs: number) {
    this.data.update((d) => {
      const cur = d[caseId] ?? { recog: [], exec: [] };
      return {
        ...d,
        [caseId]: {
          recog: pushSample(cur.recog, recogMs, MAX_SAMPLES),
          exec: pushSample(cur.exec, execMs, MAX_SAMPLES),
        },
      };
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data()));
    } catch {
      /* optional */
    }
  }

  /** mean recognition and execution for a case (null when there is no data yet) */
  of(caseId: string): { recog: number | null; exec: number | null; n: number } {
    const l = this.data()[caseId];
    return { recog: meanMs(l?.recog ?? []), exec: meanMs(l?.exec ?? []), n: l?.recog.length ?? 0 };
  }

  private read(): Record<string, Log> {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Log>;
    } catch {
      return {};
    }
  }
}
