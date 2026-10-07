/**
 * Pure rules behind the smarter trainer: which case to bring back sooner, how long to wait before
 * offering a hint, and the recognition-time log. No Angular, so they are unit-tested directly.
 */

/** How many recent timings are kept per case. */
export const MAX_SAMPLES = 20;

export function pushSample(list: number[], ms: number, max = MAX_SAMPLES): number[] {
  return [...list, Math.round(ms)].slice(-max);
}

export function meanMs(list: number[]): number | null {
  return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
}

export interface Pending {
  caseId: string;
  /** how many other cases to show before this one comes back */
  wait: number;
}

/** A DNF, or a solve clearly slower than the case's usual mean, earns a quick second look. */
export function shouldRepeatSoon(
  timeMs: number | null,
  priorMeanMs: number | null,
  attempts: number,
): boolean {
  if (timeMs === null) return true;
  if (priorMeanMs === null || attempts < 2) return false;
  return timeMs > priorMeanMs * 1.4;
}

/**
 * Called once per pick: counts every waiting case down by one and returns the first one that is due
 * (never the case just shown). The due case is removed from the queue.
 */
export function takeRepeat(
  queue: Pending[],
  lastId: string | undefined,
): { id: string | null; queue: Pending[] } {
  const counted = queue.map((q) => ({ ...q, wait: q.wait - 1 }));
  const i = counted.findIndex((q) => q.wait <= 0 && q.caseId !== lastId);
  if (i < 0) return { id: null, queue: counted };
  const id = counted[i].caseId;
  return { id, queue: counted.filter((_, k) => k !== i) };
}

/** Add a case to the queue, replacing any older entry for the same case. */
export function enqueue(queue: Pending[], caseId: string, wait = 3): Pending[] {
  return [...queue.filter((q) => q.caseId !== caseId), { caseId, wait }];
}

/** Seconds of silence (as ms) before the first hint appears: long enough not to nag. */
export function hintThresholdMs(caseMeanMs: number | null): number {
  return Math.max(6000, caseMeanMs ? caseMeanMs * 1.6 : 8000);
}

/** 0 = no hint yet; 1 = first block; 2 = first two blocks; ... one more every `stepMs`. */
export function hintStep(elapsedMs: number, thresholdMs: number, stepMs = 4000): number {
  return elapsedMs < thresholdMs ? 0 : 1 + Math.floor((elapsedMs - thresholdMs) / stepMs);
}
