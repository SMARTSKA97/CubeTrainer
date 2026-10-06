-- V1 baseline: the schema CubeTrainer shipped with before Flyway took over.
-- Flyway is the only thing that changes the schema. Never edit an applied migration; add a new V<n>__ file.

CREATE TABLE solves (
    id             uuid         PRIMARY KEY,
    at_ms          bigint       NOT NULL,
    time_ms        integer      NOT NULL,
    penalty        varchar(8)   NOT NULL DEFAULT 'none',
    scramble       varchar(400) NOT NULL,
    mode           varchar(8)   NOT NULL DEFAULT 'random',
    set_id         varchar(64),
    case_id        varchar(64),
    auf            integer,
    inspection_ms  integer,
    stage          varchar(8),
    tags           text[],

    CONSTRAINT ck_solves_penalty CHECK (penalty IN ('none', 'plus2', 'dnf')),
    CONSTRAINT ck_solves_mode    CHECK (mode IN ('random', 'case')),
    CONSTRAINT ck_solves_time    CHECK (time_ms >= 0 AND time_ms <= 86400000),
    CONSTRAINT ck_solves_auf     CHECK (auf IS NULL OR auf BETWEEN 0 AND 3),
    CONSTRAINT ck_solves_stage   CHECK (stage IS NULL OR stage IN ('full', 'cross', 'f2l', 'oll', 'pll', 'll')),
    CONSTRAINT ck_solves_case    CHECK (mode <> 'case' OR case_id IS NOT NULL)
);

CREATE INDEX ix_solves_mode_at ON solves (mode, at_ms);
CREATE INDEX ix_solves_case_at ON solves (case_id, at_ms) WHERE case_id IS NOT NULL;

CREATE TABLE case_status (
    case_id varchar(64) PRIMARY KEY,
    status  varchar(16) NOT NULL,

    CONSTRAINT ck_case_status_status CHECK (status IN ('unlearned', 'learning', 'finished'))
);

COMMENT ON TABLE solves IS 'One row per timed solve. Single-user until the identity phase adds user_id.';
COMMENT ON TABLE case_status IS 'Learning status per trainer case (unlearned / learning / finished).';
