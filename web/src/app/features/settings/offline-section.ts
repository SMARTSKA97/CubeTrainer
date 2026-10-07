import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AlgService } from '@core/data/alg-service';
import { isNative } from '@core/native';

/** Everything the app needs, fetched once so the Trainer and Algorithms work with no connection. */
@Component({
  selector: 'app-offline-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings.css',
  template: `
    <section class="card">
      <h2>Use offline</h2>
      @if (native) {
        <p class="muted">
          The algorithms and all case pictures are built into this app, so the Trainer, Algorithms,
          Drill and the animations work with no connection. Only syncing needs the internet.
        </p>
      } @else {
        <p class="muted">
          Save the whole app, every algorithm and every case picture on this device, so it opens and
          works even with no connection.
        </p>
        @if (state() === 'running') {
          <progress [value]="done()" [max]="total()"></progress>
          <p class="muted small">Saving… {{ done() }} of {{ total() }}</p>
        } @else if (state() === 'done') {
          <p class="ok">Saved. {{ total() }} files are ready for offline use.</p>
        } @else if (state() === 'error') {
          <p class="err">Could not save everything. Check your connection and try again.</p>
        } @else if (!supported) {
          <p class="muted small">This browser cannot save the app for offline use.</p>
        }
        <div class="row">
          <button
            class="btn"
            type="button"
            [disabled]="state() === 'running' || !supported"
            (click)="run()"
          >
            {{ state() === 'done' ? 'Save again' : 'Save for offline use' }}
          </button>
        </div>
      }
    </section>
  `,
})
export class OfflineSection {
  private readonly algs = inject(AlgService);
  readonly native = isNative();
  readonly supported = typeof caches !== 'undefined' && 'serviceWorker' in navigator;

  readonly state = signal<'idle' | 'running' | 'done' | 'error'>('idle');
  readonly done = signal(0);
  readonly total = signal(0);

  async run() {
    this.state.set('running');
    this.done.set(0);
    try {
      const urls = new Set<string>(['/', '/manifest.webmanifest', 'algs/algs.json']);
      for (const c of this.algs.cases()) {
        const u = this.algs.imageUrl(c);
        if (u) urls.add(u);
      }
      // The app's own scripts, including the pages that load on demand.
      const scripts = [...document.querySelectorAll('script[src]')].map(
        (s) => (s as HTMLScriptElement).src,
      );
      const sheets = [...document.querySelectorAll('link[rel="stylesheet"]')].map(
        (l) => (l as HTMLLinkElement).href,
      );
      const seen = new Set<string>();
      const queue = [...scripts];
      while (queue.length) {
        const u = queue.pop()!;
        if (seen.has(u)) continue;
        seen.add(u);
        urls.add(u);
        const text = await (await fetch(u)).text();
        for (const m of text.matchAll(/chunk-[A-Za-z0-9]+\.js/g)) {
          queue.push(new URL(m[0], u).href);
        }
      }
      for (const s of sheets) urls.add(s);
      const list = [...urls];
      this.total.set(list.length);
      // Fetching through the page lets the service worker keep a copy of each file.
      let i = 0;
      const worker = async () => {
        while (i < list.length) {
          const u = list[i++];
          const res = await fetch(u);
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
          await res.arrayBuffer();
          this.done.update((n) => n + 1);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      this.state.set('done');
    } catch {
      this.state.set('error');
    }
  }
}
