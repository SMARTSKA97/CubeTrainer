# ADR 0003: Own identity on ASP.NET Core Identity
Status: accepted (implemented in Phase 1)

Email/password plus optional TOTP and social login (Google, Facebook, Microsoft/GitHub; Apple later), with short-lived
JWT access tokens and rotating refresh tokens. Detached from Life OS. A hosted IdP was rejected to keep the user data
(handle, country, birth year, cubing profile) and leaderboard logic in one place at zero cost.
