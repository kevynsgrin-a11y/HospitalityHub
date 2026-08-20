-- Reverses migrations/0001_init.sql.
-- D1's migration runner has no built-in "down"; apply manually with
-- `wrangler d1 execute hospitalityhub --local --file migrations/reverse/0001_init.down.sql`.

DROP INDEX IF EXISTS idx_ingest_runs_source;
DROP TABLE IF EXISTS ingest_runs;
DROP INDEX IF EXISTS idx_jobs_status;
DROP INDEX IF EXISTS idx_jobs_last_seen;
DROP INDEX IF EXISTS idx_jobs_metro_role;
DROP INDEX IF EXISTS idx_jobs_canonical_key;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS metros;

-- Clear the migration bookkeeping entry so `wrangler d1 migrations apply` can re-run 0001.
DELETE FROM d1_migrations WHERE name = '0001_init.sql';
