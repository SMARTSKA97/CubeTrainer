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
      this.cases.set(data.cases);
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
