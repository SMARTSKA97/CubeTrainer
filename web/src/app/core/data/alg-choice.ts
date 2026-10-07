import { Injectable, signal } from '@angular/core';
import { algSolvesCase } from '@domain/alg-check';
import type { AlgCase } from './alg-service';

export interface AlgOption {
  alg: string;
  label: string;
  kind: 'standard' | 'alt' | 'mine';
  note?: string;
}

interface Saved {
  chosen: Record<string, string>;
  mine: Record<string, string>;
}

const KEY = 'cubetrainer.algchoice.v1';

/** Which algorithm the learner uses for each case: the standard one, an alternative, or their own. */
@Injectable({ providedIn: 'root' })
export class AlgChoice {
  private readonly saved = signal<Saved>(this.read());

  options(c: AlgCase): AlgOption[] {
    const out: AlgOption[] = [{ alg: c.alg, label: 'Standard', kind: 'standard' }];
    let n = 1;
    for (const a of c.algs ?? []) {
      if (a.alg === c.alg || out.some((o) => o.alg === a.alg)) continue;
      n++;
      out.push({
        alg: a.alg,
        label: `Option ${n}`,
        kind: 'alt',
        note: a.multi ? 'Also disturbs a second slot' : undefined,
      });
    }
    const mine = this.saved().mine[c.id];
    if (mine && !out.some((o) => o.alg === mine))
      out.push({ alg: mine, label: 'Mine', kind: 'mine' });
    return out;
  }

  /** the algorithm to show and play for this case */
  chosen(c: AlgCase): string {
    const want = this.saved().chosen[c.id];
    return this.options(c).find((o) => o.alg === want)?.alg ?? c.alg;
  }

  choose(c: AlgCase, alg: string) {
    this.update((s) => ({ ...s, chosen: { ...s.chosen, [c.id]: alg } }));
  }

  /** Checks the moves really solve this case; saves and selects them when they do. */
  saveMine(c: AlgCase, text: string): { ok: boolean; error?: string } {
    const r = algSolvesCase(c.alg, text);
    if (!r.ok || !r.alg) return { ok: false, error: r.error };
    this.update((s) => ({
      chosen: { ...s.chosen, [c.id]: r.alg! },
      mine: { ...s.mine, [c.id]: r.alg! },
    }));
    return { ok: true };
  }

  removeMine(c: AlgCase) {
    this.update((s) => {
      const mine = { ...s.mine };
      delete mine[c.id];
      const chosen = { ...s.chosen };
      delete chosen[c.id];
      return { chosen, mine };
    });
  }

  private update(fn: (s: Saved) => Saved) {
    this.saved.update(fn);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.saved()));
    } catch {
      /* optional */
    }
  }

  private read(): Saved {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
      return { chosen: v.chosen ?? {}, mine: v.mine ?? {} };
    } catch {
      return { chosen: {}, mine: {} };
    }
  }
}
