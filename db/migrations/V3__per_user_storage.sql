-- V3: solves and case status belong to a user, and carry what a sync client needs.
--
--  * user_id + composite primary keys: an id chosen by a client can never collide with, or overwrite, another user's row.
--  * rev: a database-assigned, ever-increasing change number (a trigger sets it on every insert/update). Clients remember the
--    highest rev they have seen and ask for "everything after it", so edits and deletes made on another device reach them.
--  * deleted_at: deletes are tombstones, so a device that was offline learns about them instead of re-uploading the row.
--
-- The single-user tables from V1 are kept, renamed, so no data is lost. Nothing in the app reads them any more; once you have
-- decided what to do with them (see DEPLOY.md) run `DROP TABLE legacy_solves, legacy_case_status;` in a later migration.

CREATE SEQUENCE sync_rev_seq AS bigint;

ALTER TABLE solves RENAME TO legacy_solves;
ALTER INDEX solves_pkey RENAME TO legacy_solves_pkey;
ALTER INDEX ix_solves_mode_at RENAME TO ix_legacy_solves_mode_at;
ALTER INDEX ix_solves_case_at RENAME TO ix_legacy_solves_case_at;
ALTER TABLE case_status RENAME TO legacy_case_status;
ALTER INDEX case_status_pkey RENAME TO legacy_case_status_pkey;
COMMENT ON TABLE legacy_solves IS 'Pre-account solves (shared, ownerless). Read-only archive; not used by the app.';
COMMENT ON TABLE legacy_case_status IS 'Pre-account case status (shared, ownerless). Read-only archive; not used by the app.';

CREATE TABLE solves (
    user_id        uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id             uuid         NOT NULL,
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
    rev            bigint       NOT NULL DEFAULT nextval('sync_rev_seq'),
    updated_at     timestamptz  NOT NULL DEFAULT now(),
    deleted_at     timestamptz,

    CONSTRAINT pk_solves PRIMARY KEY (user_id, id),
    CONSTRAINT ck_solves_penalty CHECK (penalty IN ('none', 'plus2', 'dnf')),
    CONSTRAINT ck_solves_mode    CHECK (mode IN ('random', 'case')),
    CONSTRAINT ck_solves_time    CHECK (time_ms >= 0 AND time_ms <= 86400000),
    CONSTRAINT ck_solves_auf     CHECK (auf IS NULL OR auf BETWEEN 0 AND 3),
    CONSTRAINT ck_solves_stage   CHECK (stage IS NULL OR stage IN ('full', 'cross', 'f2l', 'oll', 'pll', 'll')),
    CONSTRAINT ck_solves_case    CHECK (mode <> 'case' OR case_id IS NOT NULL)
);

CREATE INDEX ix_solves_user_rev ON solves (user_id, rev);
CREATE INDEX ix_solves_user_mode_at ON solves (user_id, mode, at_ms) WHERE deleted_at IS NULL;
CREATE INDEX ix_solves_user_case_at ON solves (user_id, case_id, at_ms) WHERE deleted_at IS NULL AND case_id IS NOT NULL;

CREATE TABLE case_status (
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    case_id    varchar(64) NOT NULL,
    status     varchar(16) NOT NULL,
    rev        bigint      NOT NULL DEFAULT nextval('sync_rev_seq'),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_case_status PRIMARY KEY (user_id, case_id),
    CONSTRAINT ck_case_status_status CHECK (status IN ('unlearned', 'learning', 'finished'))
);

CREATE INDEX ix_case_status_user_rev ON case_status (user_id, rev);

CREATE FUNCTION touch_sync_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.rev := nextval('sync_rev_seq');
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_solves_touch BEFORE INSERT OR UPDATE ON solves FOR EACH ROW EXECUTE FUNCTION touch_sync_row();
CREATE TRIGGER trg_case_status_touch BEFORE INSERT OR UPDATE ON case_status FOR EACH ROW EXECUTE FUNCTION touch_sync_row();

COMMENT ON TABLE solves IS 'One row per timed solve, owned by a user. Deleted rows stay as tombstones (deleted_at) so devices can sync deletes.';
COMMENT ON COLUMN solves.rev IS 'Change number from sync_rev_seq, set by trigger on every write. Clients page changes by rev.';
