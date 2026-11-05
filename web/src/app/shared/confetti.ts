import { ChangeDetectionStrategy, Component } from '@angular/core';

/** A short burst of coloured pieces for a win. Hidden when reduced motion is on. */
@Component({
  selector: 'app-confetti',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 60;
    }
    i {
      position: absolute;
      top: -12px;
      width: 8px;
      height: 14px;
      border-radius: 2px;
      opacity: 0;
      animation: fall var(--d) ease-in var(--delay) forwards;
    }
    @keyframes fall {
      0% {
        opacity: 1;
        transform: translate3d(0, 0, 0) rotate(0);
      }
      100% {
        opacity: 0;
        transform: translate3d(var(--x), 105vh, 0) rotate(var(--r));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        display: none;
      }
    }
  `,
  template: `
    @for (p of pieces; track $index) {
      <i
        [style.left.%]="p.left"
        [style.background]="p.color"
        [style.--d]="p.d + 's'"
        [style.--delay]="p.delay + 's'"
        [style.--x]="p.x + 'px'"
        [style.--r]="p.r + 'deg'"
      ></i>
    }
  `,
})
export class Confetti {
  private static readonly COLORS = [
    '#7c9cff',
    '#4ade80',
    '#fbbf24',
    '#f87171',
    '#e879f9',
    '#ffffff',
  ];
  readonly pieces = Array.from({ length: 36 }, (_, i) => ({
    left: Math.random() * 100,
    color: Confetti.COLORS[i % Confetti.COLORS.length],
    d: 1.6 + Math.random() * 1.4,
    delay: Math.random() * 0.4,
    x: Math.round((Math.random() - 0.5) * 160),
    r: Math.round(300 + Math.random() * 500),
  }));
}
