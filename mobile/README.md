# mobile/

Capacitor Android shell. The Angular app in `/web` is the single codebase; this folder holds only the native project and Capacitor config.

* `capacitor.config.json`: app id (`app.cubetrainer.android`, **change it before a Play Store release**; it cannot change afterwards), web assets from `../web/dist/web/browser`.
* `android/`: the generated Android Studio / Gradle project (committed; `app/src/main/assets/public` is generated and ignored).

## Build the APK

In CI: GitHub -> Actions -> **Android APK** -> Run workflow (needs the repository variable `API_BASE_URL`); download the artifact. See the root README.

Locally (needs JDK 21 and the Android SDK, e.g. through Android Studio):
```
cd web && npm ci && API_URL=https://cubetrainer-api.ska97homelab.uk node scripts/write-config.mjs && npx ng build
cd ../mobile && npm ci && npx cap sync android
cd android && ./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```
Install: `adb install -r app/build/outputs/apk/debug/app-debug.apk`, or copy the APK to the phone and open it (allow "install unknown apps").
