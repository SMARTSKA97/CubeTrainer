# ADR 0006: Social login

Accepted.

* **Flow:** OAuth 2.0 authorization code with PKCE, entirely server side. The browser is only redirected; the API exchanges the code,
  reads the provider's user-info endpoint (over TLS, with the token it just obtained) and never puts a token in a URL. After sign-in it
  sets the same HttpOnly refresh cookie as a password login and sends the browser to a page that trades it for an access token.
* **State:** a sealed (Data Protection) HttpOnly cookie holds state, PKCE verifier, link target and return path for 10 minutes.
  The return path must be a same-site relative path.
* **Identity:** matched by `(provider, subject)`, never by email alone.
* **Account matching:** an existing password account is auto-linked only if the provider verified the email AND the account's email is
  confirmed. If the account was never confirmed, the verified owner takes it over and any password on it is removed (pre-hijack defence).
  Otherwise the user signs in first and connects the provider in Settings.
* **New accounts:** a short-lived sealed ticket carries the provider profile to a "finish sign-up" page (username, country, birth year,
  terms), so the age gate and handle rules are the same as for email registration.
* **Passwordless accounts:** allowed. The last sign-in method cannot be removed. Deletion is confirmed by typing the username.
* **Providers** are plain configuration: a provider with a ClientId and ClientSecret is on, nothing else changes. Endpoints can be
  overridden, which the end-to-end tests use to point at a fake provider.
* **Not yet:** Sign in with Apple (needs a paid developer account and a signed client secret) and the native Android flow (Phase 7).
