import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';
import { apiBase } from '@core/config';
import { isNative } from '@core/native';
import { safeReturnUrl } from '../../features/auth/safe-redirect';
import { AppLink, challengeFor, newVerifier, parseAppLink } from '../../domain/app-oauth';
import { AuthApi } from './auth-api';
import { AuthStore } from './auth-store';

const VERIFIER = 'ct.oauthVerifier';

/**
 * Social sign-in inside the Android app. Providers refuse embedded web views, so the trip happens in the phone's browser
 * (a Chrome Custom Tab): the app opens the API's start URL together with the SHA-256 of a secret it keeps, the API finishes
 * the OAuth dance and returns to the app through `cubetrainer://auth/...`, and the app trades the one-time code plus its
 * secret for a normal session. An app that intercepted the link would hold the code but not the secret.
 */
@Injectable({ providedIn: 'root' })
export class NativeOAuth {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly api = inject(AuthApi);

  async start(provider: string, returnUrl: string): Promise<void> {
    const verifier = newVerifier();
    await Preferences.set({ key: VERIFIER, value: verifier });
    const challenge = await challengeFor(verifier);
    const url = `${apiBase()}/auth/external/${provider}/start?challenge=${challenge}&returnUrl=${encodeURIComponent(returnUrl)}`;
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  }

  /** Called for every `appUrlOpen` event; anything that is not one of our links is ignored. */
  async handle(rawUrl: string): Promise<void> {
    if (!isNative()) return;
    const link = parseAppLink(rawUrl);
    if (!link) return;
    await this.closeBrowser();
    await this.dispatch(link);
  }

  private async dispatch(link: AppLink): Promise<void> {
    switch (link.kind) {
      case 'done': {
        const verifier = (await Preferences.get({ key: VERIFIER })).value;
        await Preferences.remove({ key: VERIFIER });
        try {
          if (!verifier) throw new Error('no verifier');
          this.auth.acceptSession(
            await firstValueFrom(this.api.externalAppExchange(link.code, verifier)),
          );
          await this.router.navigateByUrl(safeReturnUrl(link.returnUrl), { replaceUrl: true });
        } catch {
          await this.router.navigate(['/auth/login'], {
            queryParams: { error: 'external_failed' },
          });
        }
        return;
      }
      case 'two-factor':
        await this.router.navigate(['/auth/two-factor'], {
          queryParams: { challenge: link.challenge, returnUrl: safeReturnUrl(link.returnUrl) },
        });
        return;
      case 'complete':
        await this.router.navigate(['/auth/external/complete'], {
          queryParams: { ticket: link.ticket, returnUrl: safeReturnUrl(link.returnUrl) },
        });
        return;
      case 'error':
        await this.router.navigate(['/auth/login'], { queryParams: { error: link.error } });
        return;
    }
  }

  private async closeBrowser(): Promise<void> {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.close(); // not implemented on Android (the tab closes when the app comes forward); harmless there
    } catch {
      /* nothing to close */
    }
  }
}
