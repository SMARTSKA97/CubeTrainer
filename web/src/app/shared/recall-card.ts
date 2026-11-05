import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { AlgCase } from '@core/data/alg-service';
import { algSolvesCase } from '@domain/alg-check';
import { formatMoves, parseMoves } from '@domain/cube';
import { chunkAlg } from '@domain/memory';
import { CasePic } from './case-pic';
import { MovePad } from './move-pad';

export interface RecallResult {
  ok: boolean;
  /** a hint was used, so it does not count as remembered */
  hinted: boolean;
}

/**
 * One memory check: the picture of a case, a keypad, and the answer is checked by actually turning
 * the cube, so any algorithm that solves the case is accepted (not only the one in the list).
 */
@Component({
  selector: 'app-recall-card',
  imports: [CasePic, MovePad],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: 14px;
    }
    .top {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    app-case-pic {
      --pic: 112px;
    }
    h3 {
      margin: 0;
      font-size: 20px;
    }
    .sub {
      color: var(--muted);
      font-size: 14px;
    }
    .msg {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 14px;
      border: 1px solid var(--line);
      background: var(--bg);
    }
    .msg.good {
      border-color: color-mix(in srgb, var(--good) 55%, transparent);
      color: var(--good);
    }
    .msg.bad {
      border-color: color-mix(in srgb, var(--bad) 55%, transparent);
      color: var(--bad);
    }
    .chunks {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chunk {
      display: grid;
      gap: 2px;
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--panel-2);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 600;
    }
    .chunk small {
      font-family: system-ui, sans-serif;
      font-weight: 400;
      color: var(--muted);
      font-size: 12px;
    }
    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .row .btn {
      flex: 1 1 120px;
    }
    .type {
      width: 100%;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
  `,
  template: `
    <div class="top">
      <app-case-pic [c]="c()" />
      <div>
        <h3>{{ c().name }}</h3>
        <div class="sub">{{ c().group }}</div>
        @if (hint()) {
          <div class="sub">
            Starts with <b>{{ chunks()[0].moves }}</b>
          </div>
        }
      </div>
    </div>

    @switch (phase()) {
      @case ('input') {
        <app-move-pad [(value)]="typed" />
        <label class="sub" for="typed-{{ c().id }}">Or type it</label>
        <input
          class="type"
          id="typed-{{ c().id }}"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="R U R' U'"
          [value]="typed()"
          (input)="typed.set($any($event.target).value)"
          (keydown.enter)="check()"
        />
        @if (error()) {
          <p class="msg bad" role="alert">{{ error() }}</p>
        }
        <div class="row">
          <button class="btn primary" type="button" (click)="check()" [disabled]="!typed().trim()">
            Check
          </button>
          <button class="btn" type="button" (click)="hint.set(true)" [disabled]="hint()">
            Hint
          </button>
          <button class="btn" type="button" (click)="giveUp()">I forgot</button>
        </div>
      }
      @case ('right') {
        <p class="msg good" role="status">
          @if (hint()) {
            Correct, but with a hint, so it will come back soon.
          } @else {
            Correct. That is it from memory.
          }
          @if (differs()) {
            Different from the listed one, but it solves this case.
          }
        </p>
        <div class="chunks" aria-label="The listed algorithm">
          @for (k of chunks(); track $index) {
            <span class="chunk"
              >{{ k.moves }}
              @if (k.hook) {
                <small>{{ k.hook }}</small>
              }
            </span>
          }
        </div>
        <button class="btn primary" type="button" (click)="finish(!hint())">Next</button>
      }
      @case ('gaveup') {
        <p class="msg bad" role="status">
          No problem. Read it in pieces, say it out loud, then it comes back in a moment.
        </p>
        <div class="chunks" aria-label="The algorithm">
          @for (k of chunks(); track $index) {
            <span class="chunk"
              >{{ k.moves }}
              @if (k.hook) {
                <small>{{ k.hook }}</small>
              }
            </span>
          }
        </div>
        <button class="btn primary" type="button" (click)="finish(false)">Got it, next</button>
      }
    }
  `,
})
export class RecallCard {
  readonly c = input.required<AlgCase>();
  readonly done = output<RecallResult>();

  readonly typed = signal('');
  readonly phase = signal<'input' | 'right' | 'gaveup'>('input');
  readonly hint = signal(false);
  readonly error = signal('');
  private readonly tries = signal(0);
  readonly differs = signal(false);
  readonly chunks = computed(() => chunkAlg(this.c().alg));

  constructor() {
    // a new case starts a clean card
    effect(() => {
      this.c();
      this.typed.set('');
      this.phase.set('input');
      this.hint.set(false);
      this.error.set('');
      this.tries.set(0);
      this.differs.set(false);
    });
  }

  check() {
    const r = algSolvesCase(this.c().alg, this.typed());
    if (!r.ok) {
      this.tries.update((n) => n + 1);
      this.error.set(r.error ?? 'That does not solve the case.');
      return;
    }
    this.error.set('');
    const norm = (s: string) => formatMoves(parseMoves(s));
    this.differs.set(norm(r.alg ?? '') !== norm(this.c().alg));
    this.phase.set('right');
  }

  giveUp() {
    this.phase.set('gaveup');
  }

  finish(ok: boolean) {
    this.done.emit({ ok, hinted: this.hint() });
  }
}
