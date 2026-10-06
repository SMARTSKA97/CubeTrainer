-- V6: which cube and method a solve was made with (stamped from the profile by the client). Additive; old rows stay NULL.
ALTER TABLE solves
    ADD COLUMN cube   varchar(48),
    ADD COLUMN method varchar(48);

-- Personal stats are always per user and usually per cube: this keeps those filters cheap.
CREATE INDEX ix_solves_user_cube ON solves (user_id, cube) WHERE deleted_at IS NULL AND cube IS NOT NULL;
