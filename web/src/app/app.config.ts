import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { Location } from '@angular/common';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { authInterceptor } from '@core/auth/auth.interceptor';
import { AuthStore } from '@core/auth/auth-store';
import { initNativeShell } from '@core/native-shell';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // Resume a previous sign-in in the background; the app does not wait for the server to wake up.
    provideAppInitializer(() => {
      void inject(AuthStore).init();
      initNativeShell(inject(Location), '#0b0d12');
    }),
  ],
};
