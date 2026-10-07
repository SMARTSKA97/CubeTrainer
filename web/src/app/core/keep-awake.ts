/**
 * Keeps the screen on while something (the timer) is on screen. Uses the Screen Wake Lock API, which
 * Chrome and the Android WebView support. Browsers drop the lock when the tab is hidden, so it is
 * taken again when the page comes back. Where the API is missing this quietly does nothing.
 */
export class KeepAwake {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private readonly onVisible = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.acquire();
  };

  start() {
    if (this.wanted) return;
    this.wanted = true;
    document.addEventListener('visibilitychange', this.onVisible);
    void this.acquire();
  }

  stop() {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisible);
    const s = this.sentinel;
    this.sentinel = null;
    void s?.release().catch(() => undefined);
  }

  private async acquire() {
    if (!('wakeLock' in navigator) || this.sentinel) return;
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!this.wanted) return void s.release().catch(() => undefined);
      this.sentinel = s;
      s.addEventListener('release', () => {
        if (this.sentinel === s) this.sentinel = null;
      });
    } catch {
      // Denied (battery saver, no permission): the screen just follows the phone's normal timeout.
    }
  }
}
