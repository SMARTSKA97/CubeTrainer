# ADR 0013: Social login in the Android app

Accepted.

* **Problem:** web social login ends in an HttpOnly cookie on the API's domain, and Google and others refuse sign-in inside embedded web views.
* **Flow:** the app opens `GET /auth/external/{provider}/start?challenge=<S256 of a secret>&returnUrl=...` in the phone's browser (Chrome Custom Tab, `@capacitor/browser`).
  The OAuth dance is unchanged (same provider callback URL, so no provider settings change). When it finishes the API redirects to the app's URL scheme
  `cubetrainer://auth/{done|two-factor|complete|error}?...`, declared as an intent filter on the main activity.
* **Getting the session:** `done` carries a sealed (Data Protection, 2 minute) code that contains the session. The app posts `{code, verifier}` to
  `POST /auth/external/app-exchange`; the API only opens the code when SHA-256(verifier) equals the challenge sent at the start (PKCE idea), and only for `X-Client-Type: native`.
  A custom URL scheme can be claimed by other apps, so a stolen link is useless without the secret, which never leaves the app until this call.
  No browser cookie is set in this flow. The session then looks exactly like a password sign-in (refresh token in the body, stored as in ADR 0011).
* **Other outcomes:** two-step verification and "finish your profile" use the existing pages (`/auth/two-factor`, `/auth/external/complete`), reached through the deep link.
* **Still web-only:** connecting/disconnecting providers in Settings (it needs the same browser round trip with a signed-in user). The provider buttons only show for providers the server has enabled.
* **Also fixed here:** the guest-only route guard called `inject()` after an `await`, which threw when a signed-in person opened the sign-in page.
* **Verification limits:** the API endpoints and their integration test run only in CI; the app side was exercised in a browser with a simulated Capacitor bridge and mocked API,
  not on a device and not against a real provider. Custom Tab behaviour on real phones (and Facebook/Microsoft quirks) is untested.
