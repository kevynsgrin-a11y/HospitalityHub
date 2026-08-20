# Batch 0 — Coverage Probe

Throwaway measurement scripts. **Excluded from any production build.** No site is built in this batch.

Answers one question: is there enough publishable server/bartender inventory to justify the build?

## Layout

- `pull.mjs` — daily Layer A pull (Techmap via RapidAPI). Run once per day for 7 consecutive days.
- `lib/techmap.mjs` — minimal API client with exponential backoff on 429/5xx.
- `lib/classify.mjs` — deterministic role/venue classification and canonical-key dedup (precision over recall).
- `config.json` — market registry (test / launch / measurement-only tiers) and query settings.
- `data/daily/YYYY-MM-DD.json` — per-day metrics record (committed).
- `data/daily.csv` — accumulating daily table (committed).
- `data/keys/*.json` — canonical keys seen per market, for day-over-day dedup (committed).
- `archive/` — raw API responses, keyed by day/source (gitignored; every figure traces to a file here).
  **Pending:** these belong in Cloudflare R2 per the spec; no Cloudflare API token was available at
  probe start, so they are archived locally and will be backfilled to R2 when a token is provisioned.
- `REPORT.md` — the Batch 0 deliverable, completed after day 7.

## Running

```
TECHMAP_API_KEY=<rapidapi key> node probe/pull.mjs [YYYY-MM-DD]
```

Date defaults to UTC today−2 (the API's freshness lag). `PAGES_TEST` / `PAGES_LAUNCH` env vars cap
`/jobs/search` pages per market (defaults 10 / 3) to stay inside the free tier; `/jobs/count` calls
do not consume job-fetch quota.

## Quota notes (verified against vendor docs 2026-08-20)

- Techmap Jobs API: $1 per 1000 postings, 1000 postings free; 10 postings per `/search` request;
  `/count` does not consume job-fetch quota. Sold via RapidAPI; the RapidAPI plan's request/month
  limit also applies.
- Fantastic.jobs: free trial 500 jobs / 50 requests per week, 7 days — secondary candidate,
  used for San Diego cross-checking only.

## Licensing (verified against primary sources 2026-08-20)

- Techmap FAQ (jobdatafeeds.com/faq): storing postings in your own database and **public display on
  job portals** is expressly permitted; **reselling raw postings to third parties is not**. This is
  compatible with an ad-supported job site.
- **Open discrepancy to resolve before Batch 2:** Techmap's inventory is scraped from job portals.
  §0.5 prohibits using a third-party service whose provenance is Indeed/LinkedIn/ZipRecruiter/
  Glassdoor/Google-for-Jobs unless the service supplies written redistribution rights. Techmap's
  per-portal source list must be confirmed (the `portal` field in responses makes this measurable —
  the probe records portal attribution for every fetched posting).
