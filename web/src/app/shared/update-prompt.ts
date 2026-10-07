import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AppUpdateStore } from '@core/update/app-update-store';
import { WebUpdateStore } from '@core/update/web-update-store';
import { TourService } from '@core/tour/tour-service';
import { formatBytes, notesToLines } from '../domain/app-update';

/**
 * Tells people a newer version exists the moment they open the app.
 *  - Android app: a sheet with the changelog and an Update button (Android still asks for its own confirmation).
 *  - Website: a small notice offering to reload onto the redeployed site.
 */
@Component({
  selector: 'app-update-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (app.prompt() && !tour.active()) {
      <div class="scrim" aria-hidden="true"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="up-title">
        <span class="grab" aria-hidden="true"></span>
        <header>
          <h2 id="up-title">Version {{ app.update()?.version }} is ready</h2>
          <p class="muted">You have {{ app.installed() }}. Your solves and settings stay.</p>
        </header>
        @if (lines().length) {
          <div class="notes" tabindex="0" aria-label="What's new">
            @for (l of lines(); track $index) {
              @if (l.startsWith('• ')) {
                <p class="li">{{ l.slice(2) }}</p>
              } @else if (l) {
                <p class="hd">{{ l }}</p>
              }
            }
          </div>
        }
        @if (app.error(); as e) {
          <p class="err" role="alert">{{ e }}</p>
        }
        @if (app.state() === 'needs-permission') {
          <p class="hint">
            Android needs your OK first. Allow “Install unknown apps” for CubeTrainer on the screen
            that just opened, come back and press Update again.
          </p>
        }
        @if (app.state() === 'downloading') {
          <div class="prog">
            <progress [value]="app.progress() ?? 0" [max]="1"></progress>
            <span class="muted">
              Downloading{{
                app.progress() !== null ? ' ' + (app.progress()! * 100).toFixed(0) + '%' : '…'
              }}
            </span>
          </div>
        }
        <div class="actions">
          <button
            class="btn"
            type="button"
            (click)="app.later()"
            [disabled]="app.state() === 'downloading'"
          >
            Later
          </button>
          <button
            class="btn primary"
            type="button"
            (click)="app.install()"
            [disabled]="app.state() === 'downloading'"
          >
            Update now{{ size() ? ' · ' + size() : '' }}
          </button>
        </div>
      </section>
    }

    @if (web.ready() && !web.dismissed() && !tour.active()) {
      <aside class="toast" role="status">
        <span class="msg"><b>A new version is ready.</b> Reload to get the latest.</span>
        <span class="acts">
          <button class="btn small" type="button" (click)="web.dismissed.set(true)">Later</button>
          <button class="btn small primary" type="button" (click)="web.reload()">Reload</button>
        </span>
      </aside>
    }
  `,
  styles: `
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 150;
      background: rgba(5, 7, 12, 0.66);
      animation: fade 0.2s both;
    }
    .sheet {
      position: fixed;
      z-index: 160;
      left: 0;
      right: 0;
      bottom: 0;
      max-width: 520px;
      margin: 0 auto;
      max-height: 86dvh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 12px 24px calc(24px + var(--sab));
      background: var(--panel);
      border: 1px solid var(--line);
      border-bottom: 0;
      border-radius: 26px 26px 0 0;
      box-shadow: 0 -24px 60px -12px rgba(0, 0, 0, 0.8);
      animation: slide 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    @media (min-width: 640px) {
      .sheet {
        bottom: 50%;
        transform: translateY(50%);
        border-bottom: 1px solid var(--line);
        border-radius: 26px;
        animation-name: fade;
      }
    }
    .grab {
      width: 40px;
      height: 4px;
      border-radius: 4px;
      background: var(--line);
      margin: 0 auto 4px;
    }
    header {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .notes {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px 18px;
      max-height: 34dvh;
      overflow: auto;
      border-radius: 16px;
      background: var(--bg);
      border: 1px solid var(--line-soft);
      font-size: 14.5px;
    }
    .notes .hd {
      font-weight: 650;
    }
    .notes .li {
      padding-left: 16px;
      position: relative;
      color: #c9cfdd;
    }
    .notes .li::before {
      content: '';
      position: absolute;
      left: 2px;
      top: 0.62em;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
    }
    .hint {
      font-size: 14px;
      color: var(--warn);
    }
    .prog {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    progress {
      width: 100%;
      height: 8px;
      accent-color: var(--accent);
    }
    .actions {
      display: flex;
      gap: 12px;
    }
    .actions .btn {
      flex: 1;
    }
    .actions .primary {
      flex: 2;
    }
    .toast {
      position: fixed;
      z-index: 120;
      left: 50%;
      bottom: 24px;
      transform: translateX(-50%);
      width: min(520px, calc(100vw - 32px));
      display: flex;
      align-items: center;
      gap: 12px 16px;
      flex-wrap: wrap;
      padding: 14px 16px 14px 20px;
      background: var(--panel-2);
      border: 1px solid #323a4e;
      border-radius: 18px;
      box-shadow: 0 18px 44px -14px rgba(0, 0, 0, 0.8);
      font-size: 14.5px;
      animation: rise 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    @media (max-width: 999px) {
      .toast {
        bottom: calc(var(--tabbar-h) + var(--sab) + 16px);
      }
    }
    .msg {
      flex: 1 1 200px;
    }
    .acts {
      display: flex;
      gap: 8px;
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @keyframes slide {
      from {
        transform: translateY(60px);
        opacity: 0;
      }
    }
    @keyframes rise {
      from {
        transform: translate(-50%, 16px);
        opacity: 0;
      }
    }
  `,
})
export class UpdatePrompt {
  readonly app = inject(AppUpdateStore);
  readonly web = inject(WebUpdateStore);
  readonly tour = inject(TourService);
  readonly lines = computed(() =>
    notesToLines(this.app.update()?.notes ?? '').filter((l) => !/^SHA-256/i.test(l)),
  );
  readonly size = computed(() => formatBytes(this.app.update()?.size ?? 0));
}
