import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { Location } from '@angular/common';
import {
  provideRouter,
  withComponentInputBinding,
  withNavigationErrorHandler,
} from '@angular/router';
import { WebUpdateStore } from '@core/update/web-update-store';
import { authInterceptor } from '@core/auth/auth.interceptor';
import { AuthStore } from '@core/auth/auth-store';
import { NativeOAuth } from '@core/auth/native-oauth';
import { initNativeShell } from '@core/native-shell';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // After a redeploy an open page can ask for a file the new site replaced: recover by reloading once.
      withNavigationErrorHandler((e) => {
        if (
          /dynamically imported module|Loading chunk|Importing a module script failed/i.test(
            String(e.error),
          )
        )
          inject(WebUpdateStore).recoverFromMissingChunk();
      }),
    ),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // Resume a previous sign-in in the background; the app does not wait for the server to wake up.
    provideAppInitializer(() => {
      void inject(AuthStore).init();
      const oauth = inject(NativeOAuth);
      initNativeShell(inject(Location), '#0b0d12', (url) => void oauth.handle(url));
    }),
  ],
};
