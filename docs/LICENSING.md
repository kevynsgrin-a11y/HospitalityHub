# Licensing Record — Layer A Vendors

Batch 2 pre-condition: confirm the license permits redistribution on an ad-supported site,
and record the confirmation and its source. Status as of 2026-08-20.

## Techmap (jobdatafeeds.com) — Daily International Job Postings API via RapidAPI

- Product: https://jobdatafeeds.com — API sold via RapidAPI
  (https://rapidapi.com/techmap-io-techmap-io-default/api/daily-international-job-postings).
- Confirmation source: Techmap's public FAQ (https://jobdatafeeds.com, FAQ section), verified
  2026-08-19 during Batch 0. It states customers may **store job postings** and use them for
  **"public display on job portals"**. An ad-supported job discovery site is a job portal;
  public display of ingested postings with source attribution and outbound apply links is
  therefore within the stated license.
- Restriction recorded from the same FAQ: **raw postings may not be resold**. We do not resell
  data; the R2 raw archive is internal-only and never exposed.
- **Open provenance caveat (unresolved):** Techmap's inventory is scraped from job portals.
  The project prohibits ingesting Indeed/LinkedIn-derived data unless redistribution rights are
  confirmed. Techmap has not published its portal source list. Action before production launch:
  obtain Techmap's source-portal list (or written confirmation) and record it here. Until then,
  ingestion is limited to development/testing and the coverage probe.

## Fantastic.jobs

- Product: https://fantastic.jobs/api, docs at https://developer.fantastic.jobs.
- Trial: 7 days, 500 jobs/week, 50 requests/week, no credit card (verified 2026-08-19).
- Redistribution terms for ad-supported display: **not yet confirmed** — their public pages do
  not state display rights explicitly. Do not ingest Fantastic.jobs data into published pages
  until written confirmation is recorded here. Secondary candidate only; not wired into Batch 2.

## Update procedure

Any new Layer A vendor requires an entry here — confirmation text, source URL, verification
date, and restrictions — before its client is enabled. Update `sources.license_terms_ref` to
point at the relevant section of this file.
