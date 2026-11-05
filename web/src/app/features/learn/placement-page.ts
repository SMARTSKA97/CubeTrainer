import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LearnService } from '@core/data/learn-service';
import { SolveStore } from '@core/data/solve-store';
import { randomScramble } from '@domain/cube';
import { LEVELS, LevelId, placeLevel } from '@domain/levels';
import { effective, formatTime } from '@domain/stats';
import { TimerPanel, TimerResult } from '@shared/timer-panel';

/** The level check: one timed solve of a scrambled cube, any method, decides the starting level. */
@Component({
  selector: 'app-placement-page',
  imports: [RouterLink, TimerPanel],
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
    .back,
    .muted {
      color: var(--muted);
      font-size: 14px;
      text-decoration: none;
    }
    .card {
      display: grid;
      gap: 12px;
    }
    .scramble {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 20px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }
    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .levels {
      display: grid;
      gap: 6px;
      padding-left: 18px;
      margin: 0;
      font-size: 14px;
      color: var(--muted);
    }
    .big {
      font-size: 40px;
      font-weight: 750;
    }
  `,
  template: `
    <a class="back" routerLink="/learn">&larr; Learn</a>
    <h1>Level check</h1>

    @if (!result()) {
      <section class="card">
        <p>
          Hold the cube with white on top and green in front, apply this scramble, then solve it
          your own way against the clock. Starting at Beginner is perfectly fine.
        </p>
        <div class="scramble" aria-label="Scramble">{{ scramble() }}</div>
        <ul class="levels">
          <li>Under 30 seconds: Advanced</li>
          <li>30 to 90 seconds: Intermediate</li>
          <li>Over 90 seconds, or not solved: Beginner</li>
        </ul>
        <div class="row">
          <button class="btn" type="button" (click)="newScramble()">New scramble</button>
          <button class="btn" type="button" (click)="cannot()">I cannot solve it yet</button>
        </div>
      </section>
      <app-timer-panel (finished)="onFinished($event)" />
    } @else {
      @if (result(); as r) {
        <section class="card" role="status">
          <span class="muted">{{ r.timeMs === null ? 'No solve' : 'Your time' }}</span>
          @if (r.timeMs !== null) {
            <div class="big">{{ fmt(r.timeMs) }}</div>
          }
          <h2>Your level: {{ levels[r.level].name }}</h2>
          <p>{{ levels[r.level].tagline }}</p>
          <p class="muted">
            Method: {{ levels[r.level].method }}. You can change level any time on the Learn page,
            and the app suggests a move up or down as your solves change.
          </p>
          <div class="row">
            <a class="btn primary" routerLink="/learn">See my path</a>
            <button class="btn" type="button" (click)="again()">Try again</button>
          </div>
        </section>
      }
    }
  `,
})
export class PlacementPage {
  private readonly learn = inject(LearnService);
  private readonly store = inject(SolveStore);
  private readonly router = inject(Router);

  readonly levels = LEVELS;
  readonly scramble = signal(randomScramble(20));
  readonly result = signal<{ timeMs: number | null; level: LevelId } | null>(null);
  fmt = (ms: number) => formatTime(ms);

  newScramble() {
    this.scramble.set(randomScramble(20));
  }
  again() {
    this.newScramble();
    this.result.set(null);
  }

  async onFinished(r: TimerResult) {
    const solve = await this.store.add({
      timeMs: Math.round(r.timeMs),
      penalty: r.penalty,
      scramble: this.scramble(),
      mode: 'random',
    });
    const t = effective(solve);
    this.place(t);
  }

  cannot() {
    this.place(null);
  }

  private place(timeMs: number | null) {
    const level = placeLevel(timeMs);
    this.learn.finishPlacement(timeMs, level);
    this.result.set({ timeMs, level });
  }
}
