import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ACCENTS, PreferencesService, Strength, ThemeMode } from '@core/preferences';
import { HapticsService } from '@core/haptics.service';
import { UpdateRefresh } from '@core/update/update-refresh';
import { Segmented, SegOption } from '@shared/segmented';
import { Switch } from '@shared/switch';

@Component({
  selector: 'app-preferences-page',
  imports: [Segmented, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      gap: var(--gap);
      max-width: 720px;
      margin: 0 auto;
      width: 100%;
    }
    h1,
    h2 {
      margin: 0;
    }
    .card {
      display: grid;
      gap: 14px;
    }
    .label {
      display: grid;
      gap: 8px;
    }
    .label > span {
      font-size: 14px;
      color: var(--muted);
    }
    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .sw {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 2px solid transparent;
      padding: 0;
      cursor: pointer;
      background: var(--c);
      box-shadow: inset 0 0 0 2px var(--panel);
    }
    .sw.on {
      border-color: var(--text);
    }
    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
  `,
  template: `
    <h1>Preferences</h1>

    <section class="card">
      <h2>Look</h2>
      <div class="label">
        <span>Theme</span>
        <app-segmented label="Theme" [options]="themes" [(value)]="p.theme" />
      </div>
      <div class="label">
        <span>Accent colour</span>
        <div class="swatches" role="radiogroup" aria-label="Accent colour">
          @for (a of accents; track a.id) {
            <button
              type="button"
              class="sw"
              role="radio"
              [class.on]="p.accent() === a.id"
              [attr.aria-checked]="p.accent() === a.id"
              [attr.aria-label]="a.name"
              [title]="a.name"
              [style.--c]="a.color"
              (click)="p.accent.set(a.id)"
            ></button>
          }
        </div>
      </div>
      <app-switch
        label="High contrast"
        hint="Stronger borders, and blue/orange instead of green/red."
        [(value)]="p.highContrast"
      />
      <app-switch
        label="Larger text"
        hint="Makes everything about 14% bigger."
        [(value)]="p.largeText"
      />
      <app-switch
        label="Reduce motion"
        hint="Shorter animations, no confetti."
        [(value)]="p.reduceMotion"
      />
    </section>

    <section class="card">
      <h2>Vibration</h2>
      @if (!h.supported) {
        <p class="muted">This device or browser does not support vibration.</p>
      }
      <app-switch
        label="Vibration"
        hint="Master switch for everything below."
        [(value)]="p.haptics"
      />
      @if (p.haptics()) {
        <div class="label">
          <span>Taps (buttons, moves, answers)</span>
          <app-segmented label="Tap strength" [options]="strengths" [(value)]="p.tapHaptics" />
        </div>
        <div class="label">
          <span>Alerts (mistakes, personal bests, finished challenges)</span>
          <app-segmented label="Alert strength" [options]="strengths" [(value)]="p.alertHaptics" />
        </div>
        <div class="row">
          <button class="btn" type="button" (click)="h.tap()">Tap</button>
          <button class="btn" type="button" (click)="h.warning()">Warning</button>
          <button class="btn" type="button" (click)="h.error()">Mistake</button>
          <button class="btn" type="button" (click)="h.success()">Success</button>
        </div>
      }
    </section>

    <section class="card">
      <h2>Something looks stuck?</h2>
      <p class="muted">
        Clears the saved copy of the app on this device and loads it again. Your solves stay.
      </p>
      <div class="row">
        <button class="btn" type="button" (click)="r.hardRefresh()">Reload fresh</button>
      </div>
    </section>
  `,
})
export class PreferencesPage {
  readonly p = inject(PreferencesService);
  readonly h = inject(HapticsService);
  readonly r = inject(UpdateRefresh);
  readonly accents = ACCENTS;
  readonly themes: SegOption<ThemeMode>[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  readonly strengths: SegOption<Strength>[] = [
    { value: 'off', label: 'Off' },
    { value: 'light', label: 'Light' },
    { value: 'strong', label: 'Strong' },
  ];
}
