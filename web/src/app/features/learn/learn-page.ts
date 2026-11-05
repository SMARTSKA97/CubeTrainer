import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LearnService } from '@core/data/learn-service';
import { LEVELS, LEVEL_IDS, LevelId, StepProgress } from '@domain/levels';
import { formatTime } from '@domain/stats';

@Component({
  selector: 'app-learn-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: var(--gap);
      max-width: 760px;
      margin: 0 auto;
      width: 100%;
    }
    h1,
    h2,
    h3,
    p {
      margin: 0;
    }
    .levels {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .lv {
      display: grid;
      gap: 4px;
      text-align: left;
      padding: 12px 14px;
      border-radius: var(--radius);
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      font: inherit;
      cursor: pointer;
    }
    .lv b {
      font-size: 16px;
    }
    .lv small {
      color: var(--muted);
      font-size: 12.5px;
    }
    .lv.view {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .lv .me {
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 700;
    }
    .intro {
      display: grid;
      gap: 6px;
    }
    .muted {
      color: var(--muted);
      font-size: 14px;
    }
    .banner {
      display: grid;
      gap: 10px;
      padding: 14px 16px;
      border-radius: var(--radius);
      border: 1px solid var(--accent);
      background: var(--accent-soft);
    }
    .banner.down {
      border-color: var(--warn);
      background: color-mix(in srgb, var(--warn) 12%, transparent);
    }
    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    ol {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
    }
    .step {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 14px 16px;
      border-radius: var(--radius);
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      text-decoration: none;
    }
    .step:hover {
      border-color: var(--accent);
    }
    .step.now {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }
    .step.done {
      opacity: 0.8;
    }
    .dot {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-weight: 700;
      background: var(--panel-2);
      color: var(--muted);
    }
    .now .dot {
      background: var(--accent);
      color: var(--on-accent);
    }
    .done .dot {
      background: var(--good);
      color: var(--on-accent);
    }
    .step h3 {
      font-size: 16px;
    }
    .step .sub {
      color: var(--muted);
      font-size: 13.5px;
    }
    .bar {
      height: 6px;
      border-radius: 99px;
      background: var(--bg);
      overflow: hidden;
      margin-top: 8px;
    }
    .bar i {
      display: block;
      height: 100%;
      background: var(--accent);
      border-radius: 99px;
    }
    .bar i.fin {
      background: var(--good);
    }
    .opt {
      font-size: 11px;
      color: var(--muted);
      border: 1px solid var(--line);
      border-radius: 99px;
      padding: 1px 7px;
      margin-left: 6px;
      vertical-align: middle;
    }
    .go {
      color: var(--accent);
      font-weight: 600;
      font-size: 14px;
      white-space: nowrap;
    }
    @media (max-width: 480px) {
      .levels {
        grid-template-columns: 1fr;
      }
      .lv {
        grid-template-columns: 1fr auto;
        align-items: center;
      }
      .lv small {
        grid-column: 1;
      }
      .step {
        grid-template-columns: 36px minmax(0, 1fr);
      }
      .go {
        grid-column: 2;
      }
    }
  `,
  template: `
    <h1>Learn</h1>

    @if (!learn.level()) {
      <section class="card intro">
        <h2>Start with a quick level check</h2>
        <p class="muted">
          Solve one scrambled cube against the clock, any way you can. The app sets your level and
          gives you the steps that fit it. Not able to solve it yet? That is fine: you start at
          Beginner.
        </p>
        <div class="row">
          <a class="btn primary" routerLink="/learn/placement">Start the level check</a>
          <button class="btn" type="button" (click)="learn.setLevel('beginner')">
            I am new: start at Beginner
          </button>
        </div>
      </section>
    }

    @if (learn.suggestion(); as s) {
      <section class="banner" [class.down]="s.action === 'demote'" role="status">
        <b>{{ s.action === 'promote' ? 'Ready to move up?' : 'Rebuild the base?' }}</b>
        <p>{{ s.reason }}</p>
        <div class="row">
          <button
            class="btn primary"
            type="button"
            (click)="learn.setLevel(s.to!); view.set(s.to!)"
          >
            {{ s.action === 'promote' ? 'Move up to ' : 'Move down to ' }}{{ names[s.to!] }}
          </button>
          <button class="btn" type="button" (click)="learn.dismissSuggestion()">Not now</button>
        </div>
      </section>
    }

    <div class="levels" role="tablist" aria-label="Levels">
      @for (id of ids; track id) {
        <button
          type="button"
          role="tab"
          class="lv"
          [class.view]="shown() === id"
          [attr.aria-selected]="shown() === id"
          (click)="view.set(id)"
        >
          <span>
            <b>{{ names[id] }}</b>
            @if (learn.level() === id) {
              <span class="me"> · your level</span>
            }
          </span>
          <small>{{ levels[id].method }}</small>
        </button>
      }
    </div>

    <section class="intro">
      <h2>{{ levels[shown()].method }}</h2>
      <p class="muted">
        {{ levels[shown()].tagline }} Typical time: {{ levels[shown()].typical }}.
      </p>
      @if (learn.level() !== shown()) {
        <div class="row">
          <button class="btn" type="button" (click)="learn.setLevel(shown())">
            Make this my level
          </button>
        </div>
      }
    </section>

    <ol>
      @for (r of rows(); track r.step.id; let i = $index) {
        <li>
          <a
            class="step"
            [class.now]="isNow(r)"
            [class.done]="r.done"
            [routerLink]="['/learn/step', r.step.id]"
          >
            <span class="dot" aria-hidden="true">{{ r.done ? '✓' : i + 1 }}</span>
            <span>
              <h3>
                {{ r.step.title }}
                @if ($any(r.step).optional) {
                  <span class="opt">optional</span>
                }
              </h3>
              <span class="sub">{{ r.step.short }}</span>
              @if (r.step.kind === 'cases') {
                <span class="sub">
                  · {{ r.recalled }} of {{ r.total }} remembered · {{ r.finished }} fast
                </span>
                <div class="bar" aria-hidden="true">
                  <i [style.width.%]="pct(r.recalled, r.total)"></i>
                </div>
              } @else if (r.step.kind === 'solves') {
                <span class="sub">· {{ r.count }} of {{ $any(r.step).need }}</span>
                <div class="bar" aria-hidden="true">
                  <i class="fin" [style.width.%]="pct(r.count, $any(r.step).need)"></i>
                </div>
              }
            </span>
            <span class="go">{{ r.done ? 'Review' : isNow(r) ? 'Continue →' : 'Open →' }}</span>
          </a>
        </li>
      }
    </ol>

    @if (learn.placement(); as p) {
      <p class="muted">
        Level check: {{ p.timeMs === null ? 'could not solve it' : fmt(p.timeMs) + ' s' }}. Placed
        at {{ names[p.level] }}.
        <a routerLink="/learn/placement">Take it again</a>
      </p>
    }
  `,
})
export class LearnPage {
  readonly learn = inject(LearnService);
  readonly ids = LEVEL_IDS;
  readonly levels = LEVELS;
  readonly names = Object.fromEntries(LEVEL_IDS.map((i) => [i, LEVELS[i].name])) as Record<
    LevelId,
    string
  >;
  readonly view = signal<LevelId | null>(null);
  readonly shown = computed<LevelId>(() => this.view() ?? this.learn.level() ?? 'beginner');
  readonly rows = computed(() => this.learn.rows()[this.shown()]);

  isNow = (r: StepProgress) =>
    this.learn.level() === this.shown() && this.learn.current()?.step.id === r.step.id;
  pct = (a: number, b: number) => (b ? Math.min(100, (a / b) * 100) : 0);
  fmt = (ms: number) => formatTime(ms);
}
