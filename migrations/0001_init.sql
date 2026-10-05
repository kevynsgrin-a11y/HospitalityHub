-- Migration number: 0001    init
-- Canonical job record, source registry, metro registry, ingest run log.
-- Reverse: migrations/reverse/0001_init.down.sql

CREATE TABLE metros (
  slug TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  state TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('test', 'launch', 'measurement_only')),
  -- Bounding geography: minimal lat/lng box plus the city names aggregated into the metro.
  bbox_lat_min REAL,
  bbox_lat_max REAL,
  bbox_lng_min REAL,
  bbox_lng_max REAL,
  cities_json TEXT NOT NULL DEFAULT '[]',
  publishable INTEGER NOT NULL DEFAULT 0 CHECK (publishable IN (0, 1))
);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('first_party_ats', 'niche_board', 'general_aggregator')),
  -- Lower number wins on duplicate collision: first-party ATS (1) > niche board (2) > aggregator (3).
  precedence INTEGER NOT NULL,
  license_terms_ref TEXT,
  robots_status TEXT,
  robots_checked_at TEXT,
  last_success_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY, -- ULID
  canonical_key TEXT NOT NULL,
  title_raw TEXT NOT NULL,
  title_normalized TEXT NOT NULL,
  role_class TEXT NOT NULL DEFAULT 'unknown'
    CHECK (role_class IN ('server', 'bartender', 'foh_other', 'boh', 'management', 'unknown')),
  employer_raw TEXT,
  employer_normalized TEXT,
  venue_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (venue_type IN ('restaurant', 'bar', 'hotel', 'casino', 'catering', 'other', 'unknown')),
  description_html TEXT,
  description_text TEXT,
  city TEXT,
  metro_slug TEXT REFERENCES metros(slug),
  state TEXT,
  postal_code TEXT,
  lat REAL,
  lng REAL,
  compensation_min REAL,
  compensation_max REAL,
  compensation_unit TEXT,
  compensation_raw TEXT,
  employment_type TEXT,
  date_posted TEXT,
  valid_through TEXT,
  apply_url TEXT,
  apply_url_host TEXT, -- secondary dedup signal
  source_url TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  source_precedence INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale', 'expired')),
  publishable INTEGER NOT NULL DEFAULT 0 CHECK (publishable IN (0, 1)),
  raw_payload_r2_key TEXT,
  -- On collision the higher-precedence record wins; the loser is retained, linked here.
  duplicate_of_job_id TEXT REFERENCES jobs(id)
);

CREATE INDEX idx_jobs_canonical_key ON jobs(canonical_key);
CREATE INDEX idx_jobs_metro_role ON jobs(metro_slug, role_class, status, publishable);
CREATE INDEX idx_jobs_last_seen ON jobs(last_seen_at);
CREATE INDEX idx_jobs_status ON jobs(status);

CREATE TABLE ingest_runs (
  id TEXT PRIMARY KEY, -- ULID
  source_id TEXT NOT NULL REFERENCES sources(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_new INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]',
  cost_units_consumed REAL NOT NULL DEFAULT 0,
  ok INTEGER CHECK (ok IN (0, 1))
);

CREATE INDEX idx_ingest_runs_source ON ingest_runs(source_id, started_at);
