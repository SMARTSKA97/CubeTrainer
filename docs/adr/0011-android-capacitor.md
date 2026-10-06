# ADR 0011: Android app (Capacitor)

Accepted.

* **One codebase:** the Angular app in `/web` is wrapped by Capacitor (`/mobile`). No separate native UI. The app's files are bundled in the APK, so it opens
  and works offline; the existing offline-first store and sync (ADR 0005) do the rest. The service worker is not registered inside the app.
* **Sign-in without cookies:** the native app sends `X-Client-Type: native`; the API then returns the rotating refresh token in the response body
  (the ADR 0003 design already allowed it) and the app keeps it in Capacitor Preferences (app-private storage), saving each new token before doing anything
  else. Reuse detection and the short reuse grace period still protect against a stolen or replayed token. Two-step verification works unchanged.
  Hardware-backed storage (Android Keystore) is a possible hardening step.
* **Origin:** the app is served from `https://localhost` (`androidScheme: https`), so the API's `CORS_ORIGINS` must include `https://localhost`.
* **Not in the app yet:** account linking in Settings (social sign-in itself was added later, ADR 0013), links in emails open in the browser (confirm there, then sign in
  in the app), push notifications, Play Store packaging (change `appId` first; it cannot change later).
* **Build:** GitHub Actions workflow "Android APK" produces a debug-signed APK for sideloading, and a release-signed APK when keystore secrets exist.
  The API address is baked in at build time from the repository variable `API_BASE_URL`.
* **Verification limits:** the Gradle build runs only in CI; the native sign-in logic was exercised in a browser with a simulated Capacitor bridge, not on a device.
