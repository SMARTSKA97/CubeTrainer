import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AppUpdateStore } from '@core/update/app-update-store';
import { formatBytes, notesToLines } from '../../domain/app-update';

@Component({
  selector: 'app-update-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings.css',
  styles: `
    .notes {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--bg);
      font-size: 14px;
      max-height: 220px;
      overflow: auto;
      white-space: pre-wrap;
    }
    progress {
      width: 100%;
      accent-color: var(--accent);
    }
  `,
  template: `
    @if (u.enabled) {
      <section class="card">
        <h2>App updates</h2>
        <p class="muted">
          Installed version {{ u.installed() || '…' }}. Updates come from this app's GitHub releases
          and are installed over the current app; your data stays.
        </p>
        @if (u.error(); as e) {
          <p class="banner error" role="alert">{{ e }}</p>
        }
        @switch (u.state()) {
          @case ('uptodate') {
            <p class="muted">You are on the latest version.</p>
          }
          @case ('needs-permission') {
            <p class="banner">
              Android needs your OK first. Allow “Install unknown apps” for CubeTrainer on the
              screen that just opened, come back here and press Update again.
            </p>
          }
        }
        @if (u.update(); as up) {
          <h3>Version {{ up.version }} is available</h3>
          @if (lines().length) {
            <pre class="notes">{{ lines().join('\\n') }}</pre>
          }
          @if (u.state() === 'downloading') {
            @if (u.progress(); as p) {
              <progress [value]="p" max="1"></progress>
              <p class="muted">Downloading… {{ (p * 100).toFixed(0) }}%</p>
            } @else {
              <p class="muted">Downloading…</p>
            }
          }
        }
        <div class="row">
          @if (u.update()) {
            <button
              class="btn primary"
              type="button"
              (click)="u.install()"
              [disabled]="u.state() === 'downloading'"
            >
              Update{{ size() ? ' (' + size() + ')' : '' }}
            </button>
          }
          <button
            class="btn"
            type="button"
            (click)="u.check()"
            [disabled]="u.state() === 'checking' || u.state() === 'downloading'"
          >
            {{ u.state() === 'checking' ? 'Checking…' : 'Check for updates' }}
          </button>
        </div>
      </section>
    }
  `,
})
export class AppUpdateSection {
  readonly u = inject(AppUpdateStore);
  readonly lines = computed(() => notesToLines(this.u.update()?.notes ?? ''));
  readonly size = computed(() => formatBytes(this.u.update()?.size ?? 0));
}
