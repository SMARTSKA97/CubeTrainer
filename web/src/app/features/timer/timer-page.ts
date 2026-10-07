import {
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { randomScramble } from '@domain/cube';
import { RetryService } from '@core/data/retry';
import { SolveStore } from '@core/data/solve-store';
import {
  STAGES,
  Stage,
  Solve,
  formatSolve,
  formatTime,
  fmtAvg,
  retryComparison,
  sessionStats,
} from '@domain/stats';
import { ScrambleNet } from '@shared/scramble-net';
import { MovePlayer } from '@shared/move-player';
import { HoldPicker } from '@shared/hold-picker';
import { SolveTags } from '@shared/solve-tags';
import { Hold, STANDARD_HOLD, schemeHex } from '@domain/orientation';
import { TimerPanel, TimerResult } from '@shared/timer-panel';
import { usePref } from '@core/pref';

@Component({
  selector: 'app-timer-page',
  standalone: true,
  imports: [TimerPanel, ScrambleNet, HoldPicker, SolveTags, MovePlayer],
  template: `
    <section class="card scramble-card">
      <app-hold-picker [value]="hold()" (valueChange)="hold.set($event)" [presets]="presets" />
      <div class="scramble-head">
        <div>
          <div class="label">Scramble</div>
          <div class="scramble">{{ scramble() }}</div>
          @if (cmp().attempts > 0) {
            <div class="retry-note">
              Attempted {{ cmp().attempts }}× before · best {{ fmt(cmp().best) }} · last
              {{ fmt(cmp().last) }}
            </div>
          }
        </div>
        <app-scramble-net [scramble]="scramble()" [scheme]="scheme()" />
      </div>
      <div class="watch">
        <button class="btn small" type="button" (click)="watching.set(!watching())">
          {{ watching() ? 'Hide animation' : '▶ Watch this scramble' }}
        </button>
      </div>
      @if (watching()) {
        <app-move-player [moves]="scramble()" [scheme]="scheme()" />
      }
      <div class="row">
        <button class="btn" (click)="prev()" [disabled]="index() === 0" title="Alt + ←">
          ← Previous
        </button>
        <button class="btn primary" (click)="next()" title="Alt + →">New scramble</button>
        <label class="field"
          >Length
          <select
            [value]="length()"
            (change)="length.set(+$any($event.target).value); regenerate()"
          >
            @for (n of [15, 20, 25]; track n) {
              <option [value]="n" [selected]="n === length()">{{ n }}</option>
            }
          </select>
        </label>
        <label class="field"
          >Practising
          <select (change)="stage.set($any($event.target).value)">
            @for (st of stages; track st.id) {
              <option [value]="st.id" [selected]="st.id === stage()">{{ st.label }}</option>
            }
          </select>
        </label>
        <label class="check"
          ><input
            type="checkbox"
            [checked]="inspection()"
            (change)="inspection.set($any($event.target).checked)"
          />
          15 s inspection</label
        >
        <label class="check"
          ><input
            type="checkbox"
            [checked]="sound()"
            (change)="sound.set($any($event.target).checked)"
          />
          Inspection beeps</label
        >
      </div>
    </section>

    <app-timer-panel
      #timer
      [inspection]="inspection()"
      [sound]="sound()"
      (finished)="onFinished($event)"
    />

    @if (last(); as l) {
      <section class="card last">
        <div>
          <div class="label">Last solve</div>
          <div class="last-time">{{ formatSolve(l) }}</div>
          @if (message()) {
            <div class="msg" [class.good]="messageGood()">{{ message() }}</div>
          }
        </div>
        <div class="row">
          <button class="btn" (click)="penalty('plus2')" [class.on]="l.penalty === 'plus2'">
            +2
          </button>
          <button class="btn" (click)="penalty('dnf')" [class.on]="l.penalty === 'dnf'">DNF</button>
          <button class="btn" (click)="penalty('none')" [disabled]="l.penalty === 'none'">
            OK
          </button>
          <button class="btn danger" (click)="remove()">Delete</button>
          <button class="btn primary" (click)="retry()">Retry this scramble</button>
        </div>
        <app-solve-tags [solve]="l" />
      </section>
    }

    <section class="card">
      <div class="label">Statistics · {{ stageLabel() }}</div>
      @if (stage() !== 'full') {
        <div class="muted" style="font-size:13px">
          Stop the timer when the {{ stageLabel() }} is finished, not at the end of the solve. These
          times are kept apart from full solves.
        </div>
      }
      <div class="stats">
        <div>
          <span>Solves</span><b>{{ stats().count }}</b>
        </div>
        <div>
          <span>Best</span><b>{{ fmtAvg(stats().best) }}</b>
        </div>
        <div>
          <span>Mean</span><b>{{ fmtAvg(stats().mean) }}</b>
        </div>
        <div>
          <span>Ao5</span><b>{{ fmtAvg(stats().ao5) }}</b>
        </div>
        <div>
          <span>Ao12</span><b>{{ fmtAvg(stats().ao12) }}</b>
        </div>
        <div>
          <span>Ao100</span><b>{{ fmtAvg(stats().ao100) }}</b>
        </div>
        <div>
          <span>Best Ao5</span><b>{{ fmtAvg(stats().bestAo5) }}</b>
        </div>
        <div>
          <span>Best Ao12</span><b>{{ fmtAvg(stats().bestAo12) }}</b>
        </div>
      </div>
      <div class="recent">
        @for (s of recent(); track s.id) {
          <span class="chip" [class.dnf]="s.penalty === 'dnf'">{{ formatSolve(s) }}</span>
        } @empty {
          <span class="muted">No solves yet.</span>
        }
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .scramble-head {
      display: flex;
      gap: 20px;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .scramble-head > app-scramble-net {
      flex: 1 1 260px;
      max-width: 420px;
      margin-inline: auto;
    }
    .scramble-head > div:first-child {
      flex: 2 1 260px;
      min-width: 0;
    }
    .scramble {
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: clamp(18px, 3vw, 26px);
      line-height: 1.5;
      word-spacing: 6px;
      max-width: 640px;
    }
    .retry-note {
      margin-top: 8px;
      color: var(--accent);
      font-size: 14px;
    }
    .last {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .last-time {
      font-size: 28px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .msg {
      font-size: 14px;
      color: var(--muted);
    }
    .msg.good {
      color: #22c55e;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 10px;
      margin: 10px 0 14px;
    }
    .stats div {
      background: var(--bg);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .stats span {
      display: block;
      font-size: 12px;
      color: var(--muted);
    }
    .stats b {
      font-size: 20px;
      font-variant-numeric: tabular-nums;
    }
    .recent {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      background: var(--bg);
      border-radius: 8px;
      padding: 4px 9px;
      font-variant-numeric: tabular-nums;
      font-size: 14px;
    }
    .chip.dnf {
      color: #ef4444;
    }
  `,
})
export class TimerPage {
  private readonly store = inject(SolveStore);
  private readonly retryService = inject(RetryService);
  private readonly timer = viewChild.required<TimerPanel>('timer');

  readonly length = usePref('timer.length', 20);
  readonly inspection = usePref('timer.inspection', false);
  readonly sound = usePref('timer.sound', false);
  readonly stage = usePref<Stage>('timer.stage', 'full');
  readonly stages = STAGES;
  readonly stageLabel = computed(() => STAGES.find((x) => x.id === this.stage())?.label ?? '');
  private readonly stageSolves = computed(() =>
    this.store.randomSolves().filter((s) => (s.stage ?? 'full') === this.stage()),
  );
  readonly watching = signal(false);
  readonly hold = usePref<Hold>('timer.hold', STANDARD_HOLD);
  readonly scheme = computed(() => schemeHex(this.hold()));
  readonly presets = [
    { label: 'Standard (white top, green front)', hold: STANDARD_HOLD },
    { label: 'Yellow top, red front', hold: { top: 'yellow', front: 'red' } as Hold },
  ];

  /** scrambles seen in this visit, so "Previous" can bring an old one back */
  private readonly seen = signal<string[]>([]);
  readonly index = signal(0);
  readonly scramble = computed(() => this.seen()[this.index()] ?? '');

  readonly last = signal<Solve | null>(null);
  readonly message = signal('');
  readonly messageGood = signal(false);

  readonly stats = computed(() => sessionStats(this.stageSolves()));
  readonly recent = computed(() => this.stageSolves().slice(-14).reverse());
  readonly cmp = computed(() => retryComparison(this.stageSolves(), this.scramble()));

  readonly formatSolve = formatSolve;
  readonly fmtAvg = fmtAvg;
  fmt = (v: number | null) => (v === null ? 'DNF' : formatTime(v));

  constructor() {
    effect(() => {
      try {
        localStorage.setItem('cubetrainer.lastScramble', this.scramble());
      } catch {
        /* optional */
      }
    });
    const pending = this.retryService.take('random');
    this.seen.set([pending?.scramble ?? randomScramble(this.length())]);
  }

  // Alt+Left / Alt+Right: previous / next scramble (same shortcuts as J-Perm's timer)
  @HostListener('document:keydown', ['$event'])
  onShortcut(e: KeyboardEvent) {
    if (!e.altKey) return;
    if (e.code === 'ArrowRight') this.next();
    else if (e.code === 'ArrowLeft') this.prev();
  }

  next() {
    if (this.index() < this.seen().length - 1) {
      this.index.update((i) => i + 1);
    } else {
      this.seen.update((l) => [...l, randomScramble(this.length())]);
      this.index.set(this.seen().length - 1);
    }
    this.afterScrambleChange();
  }

  prev() {
    if (this.index() > 0) this.index.update((i) => i - 1);
    this.afterScrambleChange();
  }

  regenerate() {
    this.seen.update((l) =>
      l.map((s, i) => (i === this.index() ? randomScramble(this.length()) : s)),
    );
    this.afterScrambleChange();
  }

  private afterScrambleChange() {
    this.message.set('');
    this.timer().cancel();
  }

  async onFinished(r: TimerResult) {
    const before = retryComparison(this.stageSolves(), this.scramble());
    const solve = await this.store.add({
      timeMs: Math.round(r.timeMs),
      penalty: r.penalty,
      scramble: this.scramble(),
      mode: 'random',
      stage: this.stage() === 'full' ? undefined : this.stage(),
      inspectionMs: r.inspectionMs || undefined,
    });
    this.last.set(solve);
    this.compareMessage(solve, before);
  }

  private compareMessage(
    solve: Solve,
    before: { attempts: number; best: number | null; last: number | null },
  ) {
    this.messageGood.set(false);
    if (!before.attempts) {
      this.message.set(solve.penalty === 'dnf' ? '' : 'First attempt on this scramble.');
      return;
    }
    const now =
      solve.penalty === 'dnf' ? null : solve.timeMs + (solve.penalty === 'plus2' ? 2000 : 0);
    if (now === null) {
      this.message.set('DNF on a scramble you have solved before.');
      return;
    }
    if (before.best === null || now < before.best) {
      const diff = before.best === null ? 0 : before.best - now;
      this.message.set(
        before.best === null
          ? 'New best on this scramble!'
          : `New best on this scramble: ${formatTime(diff)} faster than before!`,
      );
      this.messageGood.set(true);
    } else if (before.last !== null && now < before.last) {
      this.message.set(
        `Improved by ${formatTime(before.last - now)} vs your last attempt (best is still ${formatTime(before.best)}).`,
      );
      this.messageGood.set(true);
    } else {
      this.message.set(
        `${formatTime(now - before.best)} slower than your best on this scramble (${formatTime(before.best)}).`,
      );
    }
  }

  async penalty(p: 'none' | 'plus2' | 'dnf') {
    const l = this.last();
    if (!l) return;
    await this.store.setPenalty(l.id, p === l.penalty ? 'none' : p);
    this.last.set(this.store.solves().find((s) => s.id === l.id) ?? null);
  }

  async remove() {
    const l = this.last();
    if (!l) return;
    await this.store.remove(l.id);
    this.last.set(null);
    this.message.set('');
  }

  retry() {
    this.message.set('');
    this.timer().cancel();
    // same scramble stays on screen; just clear the last result so the next solve is a clean attempt
    this.last.set(null);
  }
}
