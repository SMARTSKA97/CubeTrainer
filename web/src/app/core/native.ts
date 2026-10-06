import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** True inside the Capacitor Android app, false in any browser. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

const KEY = 'ct.refreshToken';

/**
 * The native app has no HttpOnly cookie, so the rotating refresh token lives in the app's private storage
 * (Capacitor Preferences: SharedPreferences, readable only by this app). It is rotated on every use and revoked on sign-out.
 */
export const nativeRefreshToken = {
  async get(): Promise<string | null> {
    return (await Preferences.get({ key: KEY })).value;
  },
  async set(token: string): Promise<void> {
    await Preferences.set({ key: KEY, value: token });
  },
  async clear(): Promise<void> {
    await Preferences.remove({ key: KEY });
  },
};
