-- V5: authenticator-app two-step verification. Additive only.
-- users.two_factor_enabled already exists (V2). The secret is stored ENCRYPTED by the app (AES-256-GCM, key from configuration),
-- so a database leak alone does not reveal anybody's second factor.

ALTER TABLE users
    ADD COLUMN totp_secret    text,      -- present during setup (not yet active) and while 2FA is on
    ADD COLUMN totp_last_step bigint;    -- time step of the last accepted code: stops a code being used twice

-- Single-use backup codes, shown once when 2FA is enabled. Only SHA-256 hashes are stored.
CREATE TABLE recovery_codes (
    id         uuid        PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash  char(64)    NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    used_at    timestamptz,

    CONSTRAINT uq_recovery_codes UNIQUE (user_id, code_hash)
);
