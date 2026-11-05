import { Injectable } from '@angular/core';

/** Clears the saved copy of the app (service workers and caches) and loads it again. Solves live in storage and stay. */
@Injectable({ providedIn: 'root' })
export class UpdateRefresh {
  async hardRefresh(): Promise<void> {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* nothing to clear */
    }
    location.reload();
  }
}
