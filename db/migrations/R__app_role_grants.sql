-- Repeatable: re-applied whenever this file changes. Gives the runtime role DML rights only (no DDL).
-- The role is created once by hand / by infra (see DEPLOY.md); if it does not exist yet this is a no-op,
-- so a fresh local database still migrates cleanly.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cubetrainer_app') THEN
        GRANT USAGE ON SCHEMA public TO cubetrainer_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cubetrainer_app;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cubetrainer_app;
        -- flyway_schema_history is read by /health/ready only.
        GRANT SELECT ON flyway_schema_history TO cubetrainer_app;
    END IF;
END
$$;
