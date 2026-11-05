import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LearnService } from '@core/data/learn-service';

/** Today's session: three short steps and a streak. One tap on the first unfinished step. */
@Component({
  selector: 'app-session-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }
    h2 {
      margin: 0;
      font-size: 17px;
    }
    .streak {
      font-size: 13px;
      color: var(--muted);
    }
    ol {
      list-style: none;
      margin: 12px 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    li a {
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--line);
      color: inherit;
      text-decoration: none;
    }
    li.next a {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .dot {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 13px;
      background: var(--panel-2);
    }
    li.done .dot {
      background: var(--accent);
      color: var(--accent-ink, #fff);
    }
    li.done a {
      opacity: 0.65;
    }
    b {
      display: block;
      font-size: 15px;
    }
    small {
      color: var(--muted);
    }
  `,
  template: `
    <section class="card" aria-label="Today's session">
      <div class="head">
        <h2>Today's session</h2>
        <span class="streak">
          @if (learn.streak() > 0) {
            {{ learn.streak() }} day{{ learn.streak() === 1 ? '' : 's' }} in a row
          } @else {
            Start your streak
          }
        </span>
      </div>
      <ol>
        @for (it of learn.session(); track it.id; let i = $index) {
          <li [class.done]="it.done" [class.next]="!it.done && firstOpen() === i">
            <a [routerLink]="it.link">
              <span class="dot" aria-hidden="true">{{ it.done ? '✓' : i + 1 }}</span>
              <span>
                <b>{{ it.title }}</b>
                <small>{{ it.detail }}</small>
              </span>
            </a>
          </li>
        }
      </ol>
      <p class="muted" style="margin:0;font-size:13px">
        About ten minutes. Short and daily beats long and rare: the memory checks are what stop you
        forgetting.
      </p>
    </section>
  `,
})
export class SessionCard {
  readonly learn = inject(LearnService);
  firstOpen = () => this.learn.session().findIndex((i) => !i.done);
}
