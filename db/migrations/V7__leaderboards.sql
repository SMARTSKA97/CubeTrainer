-- V7: leaderboard results. One row per person, metric and period, rebuilt by a background job from their solves.
-- Who may appear is decided at query time (users.leaderboard_opt_in AND email_confirmed), so opting out hides someone immediately.
CREATE TABLE leaderboard_entries (
    user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    metric         varchar(8)  NOT NULL,
    period         varchar(8)  NOT NULL,
    value_ms       integer     NOT NULL,
    achieved_at_ms bigint      NOT NULL,
    updated_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_leaderboard_entries PRIMARY KEY (user_id, metric, period),
    CONSTRAINT ck_leaderboard_metric CHECK (metric IN ('single', 'ao5', 'ao12')),
    CONSTRAINT ck_leaderboard_period CHECK (period IN ('all', '30d')),
    CONSTRAINT ck_leaderboard_value  CHECK (value_ms > 0)
);

CREATE INDEX ix_leaderboard_board ON leaderboard_entries (metric, period, value_ms, achieved_at_ms);
