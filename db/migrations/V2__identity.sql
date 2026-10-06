-- V2: accounts. Additive only (no existing table is touched), so the previous API release keeps working
-- while this migration is applied before the new API is deployed.
-- Identity data is deliberately separate from Life OS.

CREATE TABLE users (
    id                  uuid         PRIMARY KEY,
    email               varchar(254) NOT NULL,
    normalized_email    varchar(254) NOT NULL,
    email_confirmed     boolean      NOT NULL DEFAULT false,
    password_hash       text,                                  -- null for accounts that only use social login (Phase 3)
    security_stamp      varchar(64)  NOT NULL,
    lockout_enabled     boolean      NOT NULL DEFAULT true,
    lockout_end         timestamptz,
    access_failed_count integer      NOT NULL DEFAULT 0,
    two_factor_enabled  boolean      NOT NULL DEFAULT false,   -- used from Phase 2

    -- public profile
    handle              varchar(20)  NOT NULL,
    normalized_handle   varchar(20)  NOT NULL,
    display_name        varchar(40)  NOT NULL,
    country             char(2)      NOT NULL,
    birth_year          smallint     NOT NULL,                 -- year only, never the full date
    cube_method         varchar(16),
    cube_model          varchar(60),
    cubing_since_year   smallint,
    leaderboard_opt_in  boolean      NOT NULL DEFAULT false,   -- used from Phase 6; off unless the user turns it on

    -- consent record
    terms_version       varchar(16)  NOT NULL,
    terms_accepted_at   timestamptz  NOT NULL,

    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT uq_users_normalized_email  UNIQUE (normalized_email),
    CONSTRAINT uq_users_normalized_handle UNIQUE (normalized_handle),
    CONSTRAINT ck_users_handle      CHECK (handle ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$'),
    CONSTRAINT ck_users_country     CHECK (country ~ '^[A-Z]{2}$'),
    CONSTRAINT ck_users_birth_year  CHECK (birth_year BETWEEN 1900 AND 2100),
    CONSTRAINT ck_users_cube_method CHECK (cube_method IS NULL OR cube_method IN ('cfop', 'roux', 'zz', 'petrus', 'beginner', 'mehta', 'other'))
);

-- One row per sign-in on one device. Every refresh rotates the token inside the same family;
-- presenting an already-used token revokes the whole family (stolen-token detection).
CREATE TABLE refresh_tokens (
    id                 uuid         PRIMARY KEY,
    user_id            uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    family_id          uuid         NOT NULL,
    token_hash         char(64)     NOT NULL,                  -- SHA-256 hex; the token itself is never stored
    created_at         timestamptz  NOT NULL,
    expires_at         timestamptz  NOT NULL,
    family_expires_at  timestamptz  NOT NULL,                  -- absolute cap: a session cannot be refreshed forever
    used_at            timestamptz,
    revoked_at         timestamptz,
    user_agent         varchar(256),
    ip                 varchar(45),

    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);
CREATE INDEX ix_refresh_tokens_user   ON refresh_tokens (user_id);
CREATE INDEX ix_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX ix_refresh_tokens_expiry ON refresh_tokens (expires_at);

-- Single-use links sent by email.
CREATE TABLE user_tokens (
    id          uuid         PRIMARY KEY,
    user_id     uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose     varchar(24)  NOT NULL,
    token_hash  char(64)     NOT NULL,
    created_at  timestamptz  NOT NULL,
    expires_at  timestamptz  NOT NULL,
    used_at     timestamptz,

    CONSTRAINT uq_user_tokens_hash    UNIQUE (token_hash),
    CONSTRAINT ck_user_tokens_purpose CHECK (purpose IN ('verify_email', 'reset_password'))
);
CREATE INDEX ix_user_tokens_user ON user_tokens (user_id, purpose);

COMMENT ON TABLE users IS 'CubeTrainer accounts (independent of Life OS).';
COMMENT ON COLUMN users.birth_year IS 'Self-declared; used for the age gate and age-group leaderboard filters only.';
COMMENT ON TABLE refresh_tokens IS 'Hashed rotating refresh tokens, one family per signed-in device.';
