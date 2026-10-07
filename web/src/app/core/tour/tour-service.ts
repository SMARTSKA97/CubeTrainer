import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '@core/auth/auth-store';

/** Bump when the tour changes enough that people who finished it should see it again. */
const TOUR_VERSION = '1';
const STORAGE_KEY = 'ct.tourDone';

export interface TourContext {
  signedIn: boolean;
  /** True when the full navigation bar is showing (desktop), false when the bottom tab bar is. */
  wide: boolean;
}

export interface TourStep {
  id: string;
  /** Value of the `data-tour` attribute of the element to highlight; no target = centred card. */
  target?: string;
  /** Page the step belongs to; the tour opens it first. */
  route?: string;
  title: (c: TourContext) => string;
  body: (c: TourContext) => string;
}

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/today',
    title: () => 'Welcome to CubeTrainer',
    body: () =>
      'A timer, a case trainer and a daily practice plan in one place. Here is a 30-second look around.',
  },
  {
    id: 'plan',
    target: 'plan',
    route: '/today',
    title: () => 'Your plan for today',
    body: () =>
      'A short list of cases picked for you. Cases you nail come back later, slow ones come back sooner.',
  },
  {
    id: 'today',
    target: 'today',
    title: () => 'Today',
    body: () => 'Your plan, daily goal and streak. Start here each day.',
  },
  {
    id: 'timer',
    target: 'timer',
    title: () => 'Timer',
    body: (c) =>
      c.wide
        ? 'Hold Space until the timer turns green, then let go to start. Press any key to stop.'
        : 'Press and hold the big timer until it turns green, then let go to start. Tap to stop.',
  },
  {
    id: 'trainer',
    target: 'trainer',
    title: () => 'Case trainer',
    body: () =>
      'Practise one case at a time with its picture and algorithm. Say how it went and the next review is scheduled for you.',
  },
  {
    id: 'progress',
    target: 'progress',
    title: () => 'Progress',
    body: () =>
      'Your averages, a 14-day chart and a heatmap that shows which cases are still slow.',
  },
  {
    id: 'more',
    target: 'more',
    title: (c) => (c.wide ? 'Everything else' : 'More'),
    body: (c) =>
      c.wide
        ? 'Drill, Cross solver, Algorithms, History and Leaderboards are all in this bar.'
        : 'Drill, Cross solver, Algorithms, History, Leaderboards, Settings and app updates live here.',
  },
  {
    id: 'sync',
    target: 'sync',
    title: () => 'Sync status',
    body: () =>
      'Shows whether your solves are backed up. Offline is fine: everything uploads when you are back online.',
  },
  {
    id: 'account',
    target: 'account',
    title: (c) => (c.signedIn ? 'Your profile' : 'Your account'),
    body: (c) =>
      c.signedIn
        ? 'Open your profile and settings, or sign out.'
        : 'Create a free account to keep your history on every device and to join the leaderboards.',
  },
  {
    id: 'done',
    title: () => 'You are all set',
    body: (c) =>
      c.wide
        ? 'You can replay this tour any time from the link at the bottom of the page.'
        : 'You can replay this tour any time from More, then Take the tour.',
  },
];

/** The first-run walkthrough: which step is showing, and whether the person has already seen it. */
@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);

  readonly active = signal(false);
  readonly index = signal(0);
  /** Steps whose target exists on this screen right now (set when the tour starts). */
  readonly steps = signal<TourStep[]>(STEPS);

  readonly step = computed(() => this.steps()[this.index()]);
  readonly isFirst = computed(() => this.index() === 0);
  readonly isLast = computed(() => this.index() === this.steps().length - 1);

  context(): TourContext {
    return {
      signedIn: this.auth.signedIn(),
      wide: typeof matchMedia === 'function' && matchMedia('(min-width: 1000px)').matches,
    };
  }

  seen(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === TOUR_VERSION;
    } catch {
      return true; // cannot remember it, so never nag
    }
  }

  /** Offer the tour once, on a normal page, a moment after the app is up. */
  maybeAutoStart(): void {
    if (this.seen() || this.active()) return;
    const path = this.router.url.split('?')[0];
    if (path.startsWith('/auth') || path.startsWith('/legal')) return;
    this.start();
  }

  start(): void {
    this.steps.set(STEPS);
    this.index.set(0);
    this.active.set(true);
    void this.enter();
  }

  next(): void {
    if (this.isLast()) return this.finish();
    this.index.update((i) => i + 1);
    void this.enter();
  }

  back(): void {
    if (this.isFirst()) return;
    this.index.update((i) => i - 1);
    void this.enter();
  }

  finish(): void {
    this.active.set(false);
    try {
      localStorage.setItem(STORAGE_KEY, TOUR_VERSION);
    } catch {
      /* ignore */
    }
  }

  /** Open the page a step belongs to before it is measured. */
  private async enter(): Promise<void> {
    const route = this.step()?.route;
    if (route && this.router.url.split('?')[0] !== route) await this.router.navigateByUrl(route);
  }
}
