import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TourService } from '@core/tour/tour-service';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const MARGIN = 16;

/** Spotlight walkthrough: dims the screen, rings the real control being explained and says what it does. */
@Component({
  selector: 'app-tour',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'measure()',
    '(window:scroll)': 'measure()',
    '(document:keydown)': 'onKey($event)',
  },
  template: `
    @if (tour.active() && tour.step(); as s) {
      <div class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        <div class="shield"></div>
        @if (box(); as b) {
          <div
            class="spot"
            [style.top.px]="b.top"
            [style.left.px]="b.left"
            [style.width.px]="b.width"
            [style.height.px]="b.height"
          ></div>
        } @else {
          <div class="dim"></div>
        }
        <div class="tip" [style]="tipStyle()">
          <div class="dots" aria-hidden="true">
            @for (d of tour.steps(); track d.id; let i = $index) {
              <i [class.on]="i === tour.index()" [class.past]="i < tour.index()"></i>
            }
          </div>
          <h2 id="tour-title">{{ s.title(ctx()) }}</h2>
          <p>{{ s.body(ctx()) }}</p>
          <div class="actions">
            @if (!tour.isLast()) {
              <button class="link" type="button" (click)="tour.finish()">Skip tour</button>
            }
            <span class="grow"></span>
            @if (!tour.isFirst()) {
              <button class="btn" type="button" (click)="tour.back()">Back</button>
            }
            <button #nextBtn class="btn primary" type="button" (click)="tour.next()">
              {{ tour.isLast() ? 'Start practising' : tour.isFirst() ? 'Show me around' : 'Next' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .tour {
      position: fixed;
      inset: 0;
      z-index: 200;
    }
    .shield {
      position: absolute;
      inset: 0;
    }
    .dim {
      position: absolute;
      inset: 0;
      background: rgba(5, 7, 12, 0.78);
      animation: fade 0.25s both;
    }
    .spot {
      position: absolute;
      border-radius: 14px;
      pointer-events: none;
      box-shadow:
        0 0 0 9999px rgba(5, 7, 12, 0.78),
        0 0 0 2px var(--accent),
        0 0 24px 2px rgba(124, 156, 255, 0.5);
      transition:
        top 0.3s cubic-bezier(0.3, 0.7, 0.2, 1),
        left 0.3s cubic-bezier(0.3, 0.7, 0.2, 1),
        width 0.3s cubic-bezier(0.3, 0.7, 0.2, 1),
        height 0.3s cubic-bezier(0.3, 0.7, 0.2, 1);
    }
    .tip {
      position: absolute;
      width: min(360px, calc(100vw - 2 * 16px));
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 20px 20px 16px;
      background: var(--panel-2);
      border: 1px solid #323a4e;
      border-radius: 20px;
      box-shadow: 0 24px 60px -12px rgba(0, 0, 0, 0.8);
      animation: pop 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .tip h2 {
      font-size: 18px;
    }
    .tip p {
      color: #c3c9d8;
      font-size: 14.5px;
      line-height: 1.55;
    }
    .dots {
      display: flex;
      gap: 6px;
      margin-bottom: 4px;
    }
    .dots i {
      width: 6px;
      height: 6px;
      border-radius: 99px;
      background: var(--line);
      transition:
        width 0.25s,
        background 0.25s;
    }
    .dots i.past {
      background: #4b5675;
    }
    .dots i.on {
      width: 20px;
      background: var(--accent);
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 10px;
    }
    .grow {
      flex: 1;
    }
    .link {
      background: none;
      border: 0;
      color: var(--muted);
      font: inherit;
      font-size: 14px;
      padding: 8px 4px;
      cursor: pointer;
    }
    .link:hover {
      color: var(--text);
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @keyframes pop {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
    }
  `,
})
export class AppTour {
  readonly tour = inject(TourService);
  readonly box = signal<Box | null>(null);
  readonly tipStyle = signal<Record<string, string>>({});
  readonly ctx = () => this.tour.context();
  private readonly nextBtn = viewChild<ElementRef<HTMLButtonElement>>('nextBtn');
  private seq = 0;

  constructor() {
    effect(() => {
      // Re-measure whenever the step changes (or the tour opens).
      if (this.tour.active()) {
        this.tour.index();
        void this.settle();
      } else {
        this.box.set(null);
      }
    });
    afterNextRender(() => this.nextBtn()?.nativeElement.focus());
  }

  onKey(e: KeyboardEvent): void {
    if (!this.tour.active()) return;
    if (e.key === 'Escape') this.tour.finish();
    else if (e.key === 'ArrowRight') this.tour.next();
    else if (e.key === 'ArrowLeft') this.tour.back();
  }

  /** Wait for the step's page to render, bring the target into view, then place the spotlight. */
  private async settle(): Promise<void> {
    const run = ++this.seq;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 60 : 80));
      if (run !== this.seq) return;
      const el = this.target();
      if (!this.tour.step()?.target || el) {
        el?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
        await new Promise((r) => setTimeout(r, 30));
        if (run !== this.seq) return;
        this.measure();
        this.nextBtn()?.nativeElement.focus();
        return;
      }
    }
    // The control is not on this screen: skip the step instead of pointing at nothing.
    if (run === this.seq) this.tour.next();
  }

  /** The visible element carrying the step's data-tour value (desktop and phone each have their own copy). */
  private target(): HTMLElement | null {
    const key = this.tour.step()?.target;
    if (!key) return null;
    const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`));
    return (
      all.find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }) ?? null
    );
  }

  measure(): void {
    if (!this.tour.active()) return;
    const el = this.target();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!el) {
      this.box.set(null);
      this.tipStyle.set({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      return;
    }
    const r = el.getBoundingClientRect();
    this.box.set({
      top: r.top - PAD,
      left: r.left - PAD,
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    });
    const w = Math.min(360, vw - 2 * MARGIN);
    const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, MARGIN), vw - w - MARGIN);
    const below = r.top + r.height / 2 < vh / 2;
    this.tipStyle.set(
      below
        ? { left: `${left}px`, top: `${Math.min(r.bottom + PAD + 14, vh - 200)}px` }
        : { left: `${left}px`, bottom: `${Math.max(vh - r.top + PAD + 14, MARGIN)}px` },
    );
  }
}
