import {
  Component,
  HostListener,
  OnDestroy,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Penalty, formatTime } from '@domain/stats';
import { KeepAwake } from '@core/keep-awake';

export interface TimerResult {
  timeMs: number;
  penalty: Penalty;
  inspectionMs: number;
}

type Phase = 'idle' | 'armed' | 'ready' | 'running' | 'stopped';

const HOLD_MS = 300;
const INSPECTION_MS = 15000;

/**
 * Cubing-style timer. Hold space (or press and hold the panel on a touch screen) until it turns
 * green, release to start, press again to stop. With inspection on, one tap starts the WCA 15 s
 * countdown and the hold-and-release then starts the solve; going over 15 s is +2, over 17 s is DNF.
 */
@Component({
  selector: 'app-timer-panel',
  standalone: true,
  template: `
    <div
      class="panel"
      [class.armed]="phase() === 'armed'"
      [class.ready]="phase() === 'ready'"
      [class.running]="phase() === 'running'"
      [class.inspecting]="inspecting()"
      [class.warn]="warn()"
      role="button"
      tabindex="-1"
      (pointerdown)="onDown($event)"
      (pointerup)="onUp()"
      (pointercancel)="onUp()"
    >
      <div class="time" [class.small]="inspecting()">{{ display() }}</div>
      <div class="hint">{{ hint() }}</div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .panel {
      border: 2px solid var(--line);
      border-radius: 18px;
      background: var(--panel);
      padding: 28px 12px 22px;
      text-align: center;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      cursor: pointer;
      transition:
        background 0.12s,
        border-color 0.12s;
    }
    .time {
      font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: clamp(64px, 16vw, 132px);
      font-weight: 600;
      line-height: 1.05;
      font-variant-numeric: tabular-nums;
    }
    .time.small {
      color: var(--accent);
    }
    .hint {
      margin-top: 8px;
      color: var(--muted);
      font-size: 14px;
      min-height: 20px;
    }
    .armed {
      background: #4a1d1d;
      border-color: #ef4444;
    }
    .ready {
      background: #123b24;
      border-color: #22c55e;
    }
    .running {
      border-color: var(--accent);
    }
    .warn .time {
      color: #f59e0b;
    }
  `,
})
export class TimerPanel implements OnDestroy {
  readonly inspection = input(false);
  readonly sound = input(false);
  readonly enabled = input(true);
  readonly finished = output<TimerResult>();

  readonly phase = signal<Phase>('idle');
  readonly inspecting = signal(false);
  readonly display = signal('0.00');
  readonly warn = signal(false);

  private t0 = 0;
  private inspectStart = 0;
  private inspectionMs = 0;
  private raf = 0;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  private lock = false; // swallow the key-up that follows the stopping key-down
  private beeped = new Set<number>();
  private audio?: AudioContext;
  // The screen stays on for as long as a timer is on screen, so a pause between solves never blanks it.
  private readonly awake = new KeepAwake();

  constructor() {
    this.awake.start();
  }

  readonly hint = () => {
    if (!this.enabled()) return 'Generate a scramble first';
    switch (this.phase()) {
      case 'armed':
        return 'Keep holding…';
      case 'ready':
        return 'Release to start';
      case 'running':
        return 'Press any key or tap to stop';
      default:
        break;
    }
    if (this.inspecting())
      return 'Hold space / press and hold until green, release to start the solve';
    return this.inspection()
      ? 'Tap space (or the timer) to start inspection'
      : 'Hold space (or press and hold) until green, release to start';
  };

  ngOnDestroy() {
    this.awake.stop();
    this.cancel();
  }

  // ----------------------------------------------------------------- input

  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (this.ignoreTarget(e.target)) return;
    if (e.code === 'Escape') {
      this.cancel();
      return;
    }
    if (this.phase() === 'running') {
      e.preventDefault();
      this.stop();
      this.lock = true;
      return;
    }
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (e.repeat) return;
    this.down();
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent) {
    if (this.ignoreTarget(e.target)) return;
    if (e.code !== 'Space') {
      if (this.lock) this.lock = false;
      return;
    }
    e.preventDefault();
    this.up();
  }

  onDown(e: PointerEvent) {
    e.preventDefault();
    if (this.phase() === 'running') {
      this.stop();
      this.lock = true;
      return;
    }
    this.down();
  }

  onUp() {
    this.up();
  }

  private ignoreTarget(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    if (!el || !el.tagName) return false;
    // Buttons and links are deliberately NOT ignored: after clicking "New scramble" the button keeps
    // focus, and Space must still start the timer instead of re-clicking it.
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
  }

  private down() {
    if (!this.enabled() || this.lock) return;
    const p = this.phase();
    if (p === 'running' || p === 'armed' || p === 'ready') return;
    // With inspection on and not yet inspecting, a tap (handled on release) starts the countdown.
    if (this.inspection() && !this.inspecting()) return;
    this.phase.set('armed');
    this.readyTimer = setTimeout(() => {
      if (this.phase() === 'armed') this.phase.set('ready');
    }, HOLD_MS);
  }

  private up() {
    if (this.lock) {
      this.lock = false;
      return;
    }
    const p = this.phase();
    if (p === 'armed') {
      clearTimeout(this.readyTimer);
      this.phase.set('idle');
      return;
    }
    if (p === 'ready') {
      this.start();
      return;
    }
    if (
      this.enabled() &&
      this.inspection() &&
      !this.inspecting() &&
      (p === 'idle' || p === 'stopped')
    ) {
      this.startInspection();
    }
  }

  // ----------------------------------------------------------------- logic

  private startInspection() {
    this.inspecting.set(true);
    this.warn.set(false);
    this.beeped.clear();
    this.phase.set('idle');
    this.inspectStart = performance.now();
    this.tick();
  }

  private start() {
    const now = performance.now();
    this.inspectionMs = this.inspecting() ? now - this.inspectStart : 0;
    this.inspecting.set(false);
    this.warn.set(false);
    this.t0 = now;
    this.phase.set('running');
    this.tick();
  }

  private stop() {
    const timeMs = performance.now() - this.t0;
    cancelAnimationFrame(this.raf);
    this.phase.set('stopped');
    this.display.set(formatTime(timeMs));
    let penalty: Penalty = 'none';
    if (this.inspectionMs > INSPECTION_MS + 2000) penalty = 'dnf';
    else if (this.inspectionMs > INSPECTION_MS) penalty = 'plus2';
    this.finished.emit({ timeMs, penalty, inspectionMs: Math.round(this.inspectionMs) });
  }

  /** Abort inspection / arming without recording anything. */
  cancel() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.readyTimer);
    this.inspecting.set(false);
    this.warn.set(false);
    this.phase.set('idle');
    this.display.set('0.00');
  }

  private tick = () => {
    const now = performance.now();
    if (this.phase() === 'running') {
      this.display.set(formatTime(now - this.t0));
    } else if (this.inspecting()) {
      const el = now - this.inspectStart;
      if (el <= INSPECTION_MS) {
        this.display.set(String(Math.ceil((INSPECTION_MS - el) / 1000)));
        for (const s of [8, 12]) {
          if (el >= s * 1000 && !this.beeped.has(s)) {
            this.beeped.add(s);
            this.beep(s === 8 ? 660 : 880);
          }
        }
      } else if (el <= INSPECTION_MS + 2000) {
        this.display.set('+2');
        this.warn.set(true);
      } else {
        this.display.set('DNF');
        this.warn.set(true);
      }
    } else {
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private beep(freq: number) {
    if (!this.sound()) return;
    try {
      this.audio ??= new AudioContext();
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(this.audio.destination);
      osc.start();
      osc.stop(this.audio.currentTime + 0.18);
    } catch {
      /* audio is optional */
    }
  }
}
