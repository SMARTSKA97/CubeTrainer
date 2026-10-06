# ADR 0012: In-app updates from GitHub Releases

Accepted.

* **Why:** the app is sideloaded (no Play Store), so it updates itself the way Obtainium or Orion Store apps do: new versions are GitHub Releases, the app notices, shows the changelog and installs.
* **Source:** release tags `android-vX.Y.Z` with a `.apk` asset. The app reads `GET /repos/<UPDATES_REPO>/releases` anonymously (60 requests an hour is plenty: one check a day, plus manual checks).
  Drafts, pre-releases and releases without an APK are ignored; versions are compared numerically. The last found update is cached so a quiet launch still shows the banner.
* **Install:** a small local Capacitor plugin (`AppUpdaterPlugin.java`) downloads the file to the app's cache and opens the system package installer through a `FileProvider`
  (`REQUEST_INSTALL_PACKAGES`). The user allows "Install unknown apps" for the app once. Android shows its own install screen each time; there is no silent install.
* **Safety:** Android refuses an update that is not signed with the installed app's key, so a swapped or tampered APK cannot replace the app. On top of that the plugin only downloads over https
  from `github.com` and `*.githubusercontent.com` (every redirect hop is checked) and rejects truncated downloads. The release also carries a SHA-256 file for manual checks.
* **Consequence:** releases must use the permanent release key (CI refuses to publish a release without it). Losing that key means users must uninstall and reinstall. Debug builds are never published.
* **Not done:** release-notes translation, delta updates, background checks (the app checks when opened), a Play Store listing (still possible later with its own `appId`).
* **Verification limits:** the UI and logic were exercised in a browser with a simulated bridge and fake GitHub responses (progress events were not simulated); the Java plugin and the release job only run in CI / on a phone.
