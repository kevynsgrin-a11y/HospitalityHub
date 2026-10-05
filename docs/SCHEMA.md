# D1 Schema

Source of truth: `migrations/0001_init.sql`. Reverse: `migrations/reverse/0001_init.down.sql`
(D1 has no built-in down-runner; apply the reverse file with `wrangler d1 execute`).

## `jobs` — the canonical job record

| Field | Meaning |
| --- | --- |
| `id` | ULID; also the public URL id (`/jobs/[id]/`). |
| `canonical_key` | Dedup key: `normalize(employer) \| normalize(title) \| metro_slug`. See below. |
| `title_raw` / `title_normalized` | Title as sourced / normalized form used in the key. |
| `role_class` | `server`, `bartender`, `foh_other`, `boh`, `management`, `unknown`. Only `server` and `bartender` are publishable at launch. Assigned by the Batch 4 classifier; defaults to `unknown` at ingest. |
| `employer_raw` / `employer_normalized` | Employer as sourced / normalized. |
| `venue_type` | `restaurant`, `bar`, `hotel`, `casino`, `catering`, `other`, `unknown`. Only `restaurant` and `bar` publishable at launch. |
| `description_html` / `description_text` | Sourced description; text form used for classification. |
| `city`, `metro_slug`, `state`, `postal_code`, `lat`, `lng` | Location. `metro_slug` references `metros`; CA listings outside launch metros map to `california-statewide` (measurement only). |
| `compensation_min/max/unit/raw` | Only what the source supplied. **Never inferred; missing = NULL.** |
| `employment_type` | e.g. full-time / part-time, as sourced. |
| `date_posted`, `valid_through` | Source-declared dates (ISO-8601). `valid_through` in the past forces `expired`. |
| `apply_url`, `apply_url_host` | Outbound application destination; host is the secondary dedup signal. |
| `source_url` | Canonical page where the listing was found. Required. |
| `source_id`, `source_precedence` | FK to `sources`; precedence copied at write time so collisions resolve without a join. |
| `first_seen_at`, `last_seen_at` | Ingest observation window; drives freshness lifecycle. |
| `status` | `active` → `stale` (not seen 3 daily runs) → `expired` (not seen 7, or `valid_through` past). Expired listings are never served and never sitemapped. |
| `publishable` | 1 only when: role_class ∈ {server, bartender} AND venue_type ∈ {restaurant, bar} AND metro is a publishable tier AND status = active. |
| `raw_payload_r2_key` | R2 key of the archived raw payload this row was transformed from. Every row must trace back to one. |
| `duplicate_of_job_id` | Set on collision losers; links to the winning record. Losers are retained, never deleted. |

## Dedup logic

1. `canonical_key = normalize(employer) | normalize(title) | metro_slug`.
   `normalize()` (see `worker/src/lib/normalize.ts`) lowercases, strips punctuation and legal
   suffixes (LLC, Inc, Corp, Co, Ltd, ...), and collapses whitespace.
2. On key collision, compare `apply_url_host` first: **different hosts ⇒ genuinely different
   venues** (the chain-with-two-locations case) and both records stand alone.
3. Otherwise the record with the better (lower) `source_precedence` wins:
   first-party ATS (1) > niche board (2) > general aggregator (3).
   The loser is kept with `duplicate_of_job_id` pointing at the winner.
   Implementation: `worker/src/lib/dedup.ts` (`resolveCollision`), unit-tested in
   `worker/test/dedup.test.ts` including the same-chain case.

## `sources`

Registry of every ingestion source: `kind` (`first_party_ats` / `niche_board` /
`general_aggregator`), `precedence` (lower wins), `license_terms_ref` (pointer to the licensing
doc section), `robots_status` + `robots_checked_at`, `last_success_at`, `enabled`.

## `metros`

Registry across all three tiers (`test`, `launch`, `measurement_only`) with display name, state,
bounding box, aggregated city names (`cities_json` — e.g. SF Bay Area = San Francisco + Oakland +
San Jose), and `publishable` flag. Measurement-only metros are never publishable and must never
produce routes (tested from Batch 6).

## `ingest_runs`

One row per run: source, started/finished, records seen/new/updated, error count + details,
`cost_units_consumed` (API billing units), and an `ok` flag. A run writes its row even when it
fails midway (Batch 2 acceptance criterion).
