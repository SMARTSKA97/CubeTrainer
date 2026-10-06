import { WritableSignal, effect, signal } from '@angular/core';

/** A signal whose value survives reloads (localStorage). Must be called in an injection context. */
export function usePref<T>(key: string, initial: T): WritableSignal<T> {
  const storageKey = `cubetrainer.pref.${key}`;
  let start = initial;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw !== null) start = JSON.parse(raw) as T;
  } catch {
    /* ignore corrupt values */
  }
  const s = signal<T>(start);
  effect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(s()));
    } catch {
      /* storage may be unavailable */
    }
  });
  return s;
}
