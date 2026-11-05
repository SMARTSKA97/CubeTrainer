import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlgService } from '@core/data/alg-service';
import { LearnService } from '@core/data/learn-service';
import { RecallCard, RecallResult } from '@shared/recall-card';

const MAX = 10;

/** The memory check: the algorithms that are due, typed from memory one at a time. */
@Component({
  selector: 'app-review-page',
  imports: [RouterLink, RecallCard],
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
    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .bar {
      height: 8px;
      border-radius: 99px;
      background: var(--bg);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      background: var(--accent);
      transition: width 0.3s;
    }
  `,
  template: `
    <a class="back" routerLink="/today">&larr; Today</a>
    <h1>Memory check</h1>
    @if (!started()) {
      <section class="card">
        @if (learn.due().length) {
          <p>
            {{ learn.due().length }} algorithm{{ learn.due().length === 1 ? ' is' : 's are' }} due.
            Type each one from memory; the picture is all you get. Right answers push the next check
            further away, wrong ones come back sooner.
          </p>
          <div class="row">
            <button class="btn primary" type="button" (click)="start()">
              Start ({{ Math.min(learn.due().length, max) }})
            </button>
          </div>
        } @else {
          <h2>Nothing is due</h2>
          <p class="muted">Every algorithm you have learned is still fresh. Come back tomorrow.</p>
          <div class="row">
            <a class="btn primary" routerLink="/learn">Back to your path</a>
          </div>
        }
      </section>
    } @else if (queue().length) {
      <section class="card">
        <div class="bar" aria-hidden="true">
          <i [style.width.%]="(100 * answeredCount()) / total()"></i>
        </div>
        <span class="muted">{{ answeredCount() }} of {{ total() }} · type it from memory</span>
        @for (k of [round()]; track k) {
          @if (algs.byId().get(queue()[0]); as c) {
            <app-recall-card [c]="c" (done)="answered($event)" />
          }
        }
      </section>
    } @else {
      <section class="card">
        <h2>{{ right() }} of {{ total() }} right first time</h2>
        <p class="muted">
          @if (learn.due().length) {
            {{ learn.due().length }} more are still due. Do them now, or come back later.
          } @else {
            All caught up. The ones you missed come back soon; the rest wait longer each time.
          }
        </p>
        <div class="row">
          @if (learn.due().length) {
            <button class="btn primary" type="button" (click)="start()">Keep going</button>
          }
          <a class="btn" [class.primary]="!learn.due().length" routerLink="/today">Back to Today</a>
        </div>
      </section>
    }
  `,
})
export class ReviewPage {
  readonly learn = inject(LearnService);
  readonly algs = inject(AlgService);
  readonly Math = Math;
  readonly max = MAX;

  readonly started = signal(false);
  readonly queue = signal<string[]>([]);
  readonly round = signal(0);
  readonly total = signal(0);
  readonly right = signal(0);
  private readonly missed = signal<string[]>([]);
  readonly answeredCount = computed(() => this.total() - new Set(this.queue()).size);

  start() {
    const ids = this.learn.due().slice(0, MAX);
    this.queue.set(ids);
    this.total.set(ids.length);
    this.right.set(0);
    this.missed.set([]);
    this.round.update((n) => n + 1);
    this.started.set(true);
  }

  answered(r: RecallResult) {
    const id = this.queue()[0];
    const ok = r.ok && !r.hinted;
    const first = !this.missed().includes(id);
    this.learn.recall(id, ok);
    if (ok) {
      if (first) this.right.update((n) => n + 1);
      this.queue.update((q) => q.slice(1));
    } else {
      this.missed.update((m) => [...m, id]);
      // a missed one goes to the back of the queue once more so it is tried again before you finish
      this.queue.update((q) => [...q.slice(1), id]);
    }
    this.round.update((n) => n + 1);
  }
}
