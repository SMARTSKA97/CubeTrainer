import { Injectable, computed, signal } from '@angular/core';

export interface AlgSet {
  id: string;
  label: string;
  kind: string;
  count: number;
}

export interface AlgCase {
  id: string;
  set: string;
  name: string;
  group: string;
  alg: string;
  img: string | null;
  /** all known algorithms for this exact case (F2L): `multi` = also disturbs a second slot */
  algs?: { alg: string; multi?: boolean }[];
  /** scramble that builds the case on a solved cube (no AUF) */
  setup?: string;
  /** F2L slots (FR, FL, BR, BL) the case disturbs */
  slots?: string[];
  /** a long case that is really two algorithms in a row (OLL then PLL), so it is learned and played in steps */
  stages?: { name: string; tip: string; alg: string }[];
}

@Injectable({ providedIn: 'root' })
export class AlgService {
  readonly sets = signal<AlgSet[]>([]);
  readonly cases = signal<AlgCase[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);

  readonly byId = computed(() => new Map(this.cases().map((c) => [c.id, c])));

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      const res = await fetch('algs/algs.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { sets: AlgSet[]; cases: AlgCase[] };
      this.sets.set(data.sets);
      this.cases.set(addStages(data.cases));
      this.loaded.set(true);
    } catch (e) {
      this.error.set(`Could not load algorithms: ${(e as Error).message}`);
    }
  }

  casesOf(setId: string): AlgCase[] {
    return this.cases().filter((c) => c.set === setId);
  }

  groupsOf(setId: string): string[] {
    return [...new Set(this.casesOf(setId).map((c) => c.group))];
  }

  imageUrl(c: AlgCase): string | null {
    return c.img ? `algs/${c.img}` : null;
  }
}

/**
 * "OLL + PLL" cases are one OLL algorithm followed by one PLL algorithm. Written out as a single
 * string they look like one long, odd algorithm, so each is split back into its two steps.
 */
function addStages(cases: AlgCase[]): AlgCase[] {
  const oll = new Map<string, AlgCase>();
  const pll = new Map<string, AlgCase>();
  for (const c of cases) {
    if (c.set === 'oll') {
      const n = /^OLL (\d+)/.exec(c.name)?.[1];
      if (n) oll.set(n, c);
    } else if (c.set === 'pll') pll.set(c.name, c);
  }
  return cases.map((c) => {
    if (c.set !== 'ollpll') return c;
    const m = /^OLL (\d+)\b.*→\s*(\w+)\s*$/.exec(c.name);
    const o = m && oll.get(m[1]);
    const p = m && pll.get(m[2]);
    if (!o || !p || `${o.alg} ${p.alg}` !== c.alg) return c;
    return {
      ...c,
      stages: [
        {
          name: `Step 1 · Orient the last layer (OLL ${m![1]})`,
          tip: 'Turn every top sticker to the top colour. The pieces may still be in the wrong places.',
          alg: o.alg,
        },
        {
          name: `Step 2 · Permute (${m![2]} perm)`,
          tip: 'Move the pieces into place. A final U turn may be needed to line up the top layer.',
          alg: p.alg,
        },
      ],
    };
  });
}
