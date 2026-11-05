import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PreferencesService } from './preferences';

/**
 * Vibrations for the timer, the move player and the quizzes. Phone motors are weak and the system's own
 * "impact" and "notification" effects are barely felt on many Androids, so everything here is a plain
 * timed vibration (longer for a bigger event), with a heavy impact on top where it helps.
 * Taps and alerts each have their own strength in Preferences. Native in the app; the browser's vibrate
 * API on the web (where supported). A pattern is `[on, off, on, ...]` in milliseconds.
 */
@Injectable({ providedIn: 'root' })
export class HapticsService {
  private readonly prefs = inject(PreferencesService);
  private readonly native = Capacitor.isNativePlatform();
  private timers: ReturnType<typeof setTimeout>[] = [];
  /** When the last vibration was asked for, so a burst of taps is not sent to the phone one by one. */
  private lastAt = 0;

  /** Whether this device can vibrate at all (to say so in Preferences). */
  readonly supported =
    Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && 'vibrate' in navigator);

  private get on(): boolean {
    return this.prefs.haptics();
  }

  /** A short tick: a button, a tab, one move of the player. */
  tick(): void {
    this.tapBuzz(22, 40);
  }

  /** A tap: an answer chosen, the timer armed. */
  tap(): void {
    this.tapBuzz(30, 50);
  }

  /** A firmer thump: the timer started or stopped, a case answered. */
  place(): void {
    this.tapBuzz(45, 75, true);
  }

  /** A caution: inspection time running out. */
  warning(): void {
    this.alert([60, 70, 60], [40]);
  }

  /** A wrong answer, a DNF. */
  error(): void {
    this.alert([90, 60, 90, 60, 160], [60]);
  }

  /** A personal best, a finished daily challenge, a new level: a rising flourish. */
  success(): void {
    this.alert([50, 60, 70, 60, 90, 60, 260], [50]);
  }

  private tapBuzz(light: number, strong: number, impact = false): void {
    if (!this.on) return;
    const level = this.prefs.tapHaptics();
    if (level === 'off') return;
    this.buzz([level === 'strong' ? strong : light]);
    if (impact && level === 'strong') this.heavy();
  }

  /** `gentle` is what an alert becomes when the person chose light alerts: one short buzz instead of a pattern. */
  private alert(pattern: number[], gentle: number[]): void {
    if (!this.on) return;
    const level = this.prefs.alertHaptics();
    if (level === 'off') return;
    this.buzz(level === 'light' ? gentle : pattern);
  }

  private heavy(): void {
    if (this.native) void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
  }

  private buzz(pattern: number[]): void {
    const now = Date.now();
    // Short taps closer than 60 ms apart are dropped: the motor cannot show them apart, and every one is a call across to the phone.
    if (pattern.length === 1 && now - this.lastAt < 60) return;
    this.lastAt = now;
    try {
      if (this.native) {
        this.timers.forEach(clearTimeout);
        this.timers = [];
        let at = 0;
        pattern.forEach((ms, i) => {
          if (i % 2 === 0)
            this.timers.push(
              setTimeout(() => void Haptics.vibrate({ duration: ms }).catch(() => undefined), at),
            );
          at += ms;
        });
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator)
        navigator.vibrate(pattern);
    } catch {
      /* no vibration motor, or blocked: carry on silently */
    }
  }
}
