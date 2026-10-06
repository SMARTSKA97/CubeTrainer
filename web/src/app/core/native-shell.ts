import { Location } from '@angular/common';
import { isNative } from './native';

/** Android niceties: the hardware back button walks the route history (and leaves the app from the first page), and the status bar matches the app. */
export function initNativeShell(
  location: Location,
  background: string,
  onAppUrl: (url: string) => void,
): void {
  if (!isNative()) return;
  void import('@capacitor/app').then(({ App }) =>
    App.addListener('appUrlOpen', ({ url }) => onAppUrl(url)),
  );
  void import('@capacitor/app').then(({ App }) =>
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) location.back();
      else void App.exitApp();
    }),
  );
  void import('@capacitor/status-bar').then(async ({ StatusBar, Style }) => {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: background });
  });
}
