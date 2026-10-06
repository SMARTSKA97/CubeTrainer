import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** Native side lives in mobile/android/app/src/main/java/app/cubetrainer/android/AppUpdaterPlugin.java. */
export interface AppUpdaterPlugin {
  /** Whether Android currently lets this app install APKs ("Install unknown apps"). */
  canInstall(): Promise<{ allowed: boolean }>;
  /** Opens the system page where the user grants that permission to this app. */
  openInstallSettings(): Promise<void>;
  /** Downloads the APK (GitHub hosts only), then hands it to the system installer. Resolves when the installer is shown. */
  downloadAndInstall(opts: { url: string; fileName: string }): Promise<void>;
  addListener(
    event: 'progress',
    cb: (p: { received: number; total: number }) => void,
  ): Promise<PluginListenerHandle>;
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');
