-- V4: sign-in with other providers (Google, Microsoft, GitHub, Facebook). Additive only.
-- An account may have no password at all when it signs in through a provider (users.password_hash is already nullable).

CREATE TABLE external_logins (
    id         uuid         PRIMARY KEY,
    user_id    uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider   varchar(16)  NOT NULL,
    subject    varchar(190) NOT NULL,           -- the provider's stable id for the person; never their email
    email      varchar(254),                    -- as reported when linking; informational
    created_at timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT ck_external_logins_provider CHECK (provider IN ('google', 'microsoft', 'github', 'facebook', 'apple')),
    CONSTRAINT uq_external_logins_subject UNIQUE (provider, subject),
    CONSTRAINT uq_external_logins_user_provider UNIQUE (user_id, provider)
);
