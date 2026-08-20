# Pages Overview and Interface Mapping

## Route map

| Route | Template | Data query (D1) | Indexability |
| --- | --- | --- | --- |
| `/` | `site/index.html` | Publishable metros from `metros` | index once any metro passes the thin-content guard |
| `/[metro]/` | `site/templates/metro.html` | Active publishable job counts for the metro, split by role | thin-content guard |
| `/[metro]/servers/` | `site/templates/role.html` | `jobs` where `metro_slug = ? AND role_class = 'server' AND publishable = 1 AND status = 'active' AND duplicate_of_job_id IS NULL`, newest `date_posted` first | thin-content guard |
| `/[metro]/bartenders/` | `site/templates/role.html` | Same with `role_class = 'bartender'` | thin-content guard |
| `/jobs/[id]/` | `site/templates/job.html` | Single row from `jobs` by ULID | index while `status = 'active'`; 410 via `site/_redirects` once expired |
| (expired job) | `site/410.html` | — | `noindex` |

Measurement-only metros (`california-statewide`) never generate routes.

**Thin-content guard (Batch 5):** a market/role page is indexable only when it has ≥ 12 active
listings AND ≥ 30% were first seen within the last 7 days. Otherwise the generator injects
`<meta name="robots" content="noindex, follow">` via `{{ROBOTS_META}}` and drops the URL from
the sitemap. Until the guard is implemented, all pages carry `noindex, follow`.

## Template token contracts

- `metro.html`: `{{METRO_NAME}} {{METRO_SLUG}} {{STATE}} {{ACTIVE_COUNT}} {{ROBOTS_META}}`
- `role.html`: `{{METRO_NAME}} {{METRO_SLUG}} {{ROLE_LABEL}} {{ROLE_SLUG}} {{ROBOTS_META}} {{JOB_CARDS}}`
- `job.html`: `{{TITLE}} {{EMPLOYER}} {{VENUE_TYPE}} {{LOCATION}} {{DATE_POSTED}} {{APPLY_URL}} {{SOURCE_NAME}} {{JSONLD}} {{FACT_ROWS}} {{DESCRIPTION_HTML}}`

Generator rules baked into the contracts:
- NULL database fields are omitted from the rendered page entirely — no placeholders, no
  invented values. Compensation renders only when the source supplied it.
- `{{JSONLD}}` is the JobPosting JSON-LD block (Batch 5), validated against Google's
  structured-data guidance.
- Apply links use `rel="noopener nofollow external"` and always leave the site.

## Function / interface mapping (Worker)

| Module | Exports | Used by |
| --- | --- | --- |
| `worker/src/lib/types.ts` | `JobRecord`, `Metro`, `Source`, `Env`, enums (`RoleClass`, `VenueType`, `JobStatus`, `MetroTier`, `SourceKind`) | everything |
| `worker/src/lib/normalize.ts` | `normalize(input)`, `canonicalKey(employer, title, metroSlug)`, `applyUrlHost(applyUrl)` | ingest (Batch 2), dedup |
| `worker/src/lib/dedup.ts` | `resolveCollision(existing, incoming): CollisionResult` (`winner`, `loser`, `distinct`) | ingest upsert path |
| `worker/src/lib/ulid.ts` | `ulid(now?)` | job id generation |
| `worker/src/index.ts` | `fetch` (health/API scaffold), `scheduled` (daily cron `0 10 * * *`, runs the Layer A ingest; KV-configurable) | Cloudflare runtime |
| `worker/src/ingest/techmap.ts` | `TechmapClient` (`count`, `searchPage`; retries/backoff, injectable `HttpGet`), `parseSearchPayload(rawText)` | Layer A ingest |
| `worker/src/ingest/mapper.ts` | `mapTechmapJob(raw): { fields, unmappedKeys }` — vendor → canonical, NULL for absent fields | Layer A ingest |
| `worker/src/ingest/run.ts` | `runTechmapIngest(env, client, cfg)`, `ingestArchivedPayload(env, rawText, ctx)` (re-run from R2 archive), `rawArchiveKey(...)` | scheduled handler |

Bindings (`wrangler.toml`): `DB` (D1 `hospitalityhub`), `CONFIG` (KV: feature flags, `ingest_schedule`),
`RAW` (R2: raw payload archive). Secrets via Wrangler: `TECHMAP_API_KEY`, `FANTASTIC_JOBS_API_KEY`
(local dev: `.dev.vars`, template in `.dev.vars.example`).

## Data flow

```
vendor APIs / permitted crawls (Batch 2-3)
  → raw payload archived to R2 (RAW)
  → transform + normalize → canonicalKey → resolveCollision against D1 (DB)
  → classifier assigns role_class / venue_type (Batch 4)
  → publishable flag computed
  → static generator (Batch 5) renders site/ templates → Cloudflare Pages via GitHub
  → freshness cron marks stale/expired; expired ids appended to site/_redirects (410)
```

## Not yet implemented (by design)

Crawler (Batch 3), classifier + eval set (Batch 4), static generator,
sitemap/robots.txt generation and JSON-LD emission (Batch 5), multi-market ops (Batch 6). The
templates and interfaces above are the contracts those batches fill in.
