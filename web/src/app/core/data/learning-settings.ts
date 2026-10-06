import { Injectable, effect, signal } from '@angular/core';
import { DEFAULT_RULES, LearningRules, targetSeconds } from '@domain/learning';

/** User-editable auto-learning settings, kept in localStorage. */
@Injectable({ providedIn: 'root' })
export class LearningSettings {
  private readonly KEY = 'cubetrainer.learning.v1';
  readonly auto = signal(true);
  readonly targets = signal<Record<string, number>>({});
  readonly minDays = signal(DEFAULT_RULES.minDays);

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) ?? 'null');
      if (raw) {
        this.auto.set(raw.auto ?? true);
        this.targets.set(raw.targets ?? {});
        this.minDays.set(raw.minDays ?? DEFAULT_RULES.minDays);
      }
    } catch {
      /* defaults */
    }
    effect(() => {
      const v = { auto: this.auto(), targets: this.targets(), minDays: this.minDays() };
      try {
        localStorage.setItem(this.KEY, JSON.stringify(v));
      } catch {
        /* storage unavailable */
      }
    });
  }

  rules(): LearningRules {
    return { ...DEFAULT_RULES, minDays: this.minDays() };
  }

  targetMs(setId: string): number {
    return targetSeconds(setId, this.targets()) * 1000;
  }

  setTarget(setId: string, seconds: number) {
    if (!(seconds > 0)) return;
    this.targets.update((t) => ({ ...t, [setId]: seconds }));
  }
}
