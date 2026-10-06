import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { loadConfig } from '@core/config';
import { isNative } from '@core/native';

loadConfig()
  .then(() => bootstrapApplication(App, appConfig))
  .then(() => {
    // Offline support: only over https (or localhost), never in `ng serve` dev where files change constantly.
    if (
      !isNative() && // the app's files are already inside the APK
      'serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost') &&
      location.port !== '4200'
    ) {
      navigator.serviceWorker.register('sw.js').catch(() => undefined);
    }
  })
  .catch((err) => console.error(err));
