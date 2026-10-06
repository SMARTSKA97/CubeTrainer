# ADR 0007: Two-step verification (TOTP)

Accepted.

* **Method:** authenticator-app codes, RFC 6238 (HMAC-SHA1, 6 digits, 30 s), checked against the published test vectors. Optional per account.
  SMS is deliberately not offered (SIM-swap, cost).
* **Setup:** password re-entry (when the account has one), then a fresh secret and QR code. Nothing switches on until the user proves the app
  works by entering a first code. Ten single-use recovery codes are shown once; only their SHA-256 hashes are stored.
* **Secret at rest:** AES-256-GCM, key from configuration (`Totp__EncryptionKey`), so a database leak alone does not reveal a second factor.
  The API will not start in production without the key.
* **Sign-in:** the password step returns a sealed, 5-minute challenge instead of a session; `POST /auth/login/2fa` trades challenge + code for
  the session. The wrong-password response is identical whether or not 2FA is on. The same gate applies to social sign-in and to linking a
  provider by matching email, so a social login cannot bypass it.
* **Brute force:** wrong codes count toward the same account lockout as wrong passwords (5 failures / 15 min).
* **Replay:** the last accepted time step is stored, so a code, even one that is still inside the clock-drift window (one step each way),
  works once. Recovery codes are consumed atomically.
* **Turning off / new codes:** need a current code (a recovery code is accepted), plus the password for turn-off. Email notices go out on
  enable and disable.
* **Not yet:** WebAuthn / passkeys, trusted-device "remember me", forcing 2FA for admin roles.
