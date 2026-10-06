import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { loadConfig } from '@core/config';

loadConfig()
  .then(() => bootstrapApplication(App, appConfig))
  .then(() => {
    // Offline support: only over https (or localhost), never in `ng serve` dev where files change constantly.
    if (
      'serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost') &&
      location.port !== '4200'
    ) {
      navigator.serviceWorker.register('sw.js').catch(() => undefined);
    }
  })
  .catch((err) => console.error(err));
