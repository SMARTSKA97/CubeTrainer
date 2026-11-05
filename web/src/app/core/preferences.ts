import { Injectable, effect, inject, DOCUMENT } from '@angular/core';
import { usePref } from './pref';
import { setStatusBar } from './native-shell';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Strength = 'off' | 'light' | 'strong';

export interface AccentOption {
  id: string;
  name: string;
  /** swatch shown in Preferences (the shade used on a dark background) */
  color: string;
}

export const ACCENTS: AccentOption[] = [
  { id: 'default', name: 'Blue', color: '#7c9cff' },
  { id: 'sky', name: 'Sky', color: '#7dd3fc' },
  { id: 'teal', name: 'Teal', color: '#5eead4' },
  { id: 'forest', name: 'Forest', color: '#86efac' },
  { id: 'gold', name: 'Gold', color: '#fcd34d' },
  { id: 'sunset', name: 'Sunset', color: '#fdba74' },
  { id: 'coral', name: 'Coral', color: '#ff9b86' },
  { id: 'rose', name: 'Rose', color: '#f9a8d4' },
  { id: 'orchid', name: 'Orchid', color: '#e879f9' },
  { id: 'indigo', name: 'Indigo', color: '#a5b4fc' },
];

const BAR_DARK = '#0c0e13';
const BAR_LIGHT = '#f3f5f9';

/**
 * Per-device preferences: how the app looks (theme, accent colour, contrast, text size, motion) and how
 * it feels (vibration). Kept in localStorage; `index.html` applies the look before the app starts so
 * there is no flash of the wrong theme.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly doc = inject(DOCUMENT);

  /** Dark is the default so nothing changes for anyone who never opens Preferences. */
  readonly theme = usePref<ThemeMode>('theme', 'dark');
  readonly accent = usePref('accent', 'default');
  readonly highContrast = usePref('highContrast', false);
  readonly largeText = usePref('largeText', false);
  readonly reduceMotion = usePref('reduceMotion', false);

  readonly haptics = usePref('haptics', true);
  /** how strong the small taps are (a button, a move, an answer) */
  readonly tapHaptics = usePref<Strength>('hapticsTap', 'strong');
  /** how strong the patterns are (a mistake, a personal best, a finished challenge) */
  readonly alertHaptics = usePref<Strength>('hapticsAlert', 'strong');

  constructor() {
    effect(() => {
      const root = this.doc.documentElement;
      root.setAttribute('data-theme', this.theme());
      this.toggle(root, 'data-accent', this.accent() !== 'default' ? this.accent() : null);
      this.toggle(root, 'data-contrast', this.highContrast() ? 'high' : null);
      this.toggle(root, 'data-large', this.largeText() ? 'true' : null);
      this.toggle(root, 'data-motion', this.reduceMotion() ? 'reduced' : null);
      const dark = this.theme() === 'dark' || (this.theme() === 'system' && !this.systemLight());
      const color = dark ? BAR_DARK : BAR_LIGHT;
      this.doc
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((m) => m.setAttribute('content', color));
      setStatusBar(dark, color);
    });
    if (typeof matchMedia === 'function') {
      matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        // re-run the effect's work for "System"
        if (this.theme() === 'system') this.theme.set('system');
      });
    }
  }

  private systemLight(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
  }

  private toggle(root: HTMLElement, name: string, value: string | null) {
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  }
}
