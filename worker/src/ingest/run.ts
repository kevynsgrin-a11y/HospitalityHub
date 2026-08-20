// Layer A daily ingest: Techmap -> R2 raw archive -> canonical `jobs` rows.
//
// Invariants (Batch 2 acceptance criteria):
// - Every raw response is archived to R2 BEFORE transformation; every job row carries
//   raw_payload_r2_key. Transformation is re-runnable from the archive via
//   ingestArchivedPayload without touching the API.
// - Idempotent: re-running the same day produces no duplicate rows and no
//   last_seen_at churn (freshness is day-granular).
// - A complete ingest_runs record is written even when the run fails midway:
//   the row is inserted at start and finalized in `finally`.
// - Per-city failures are recorded and skipped; they do not abort the run.

import type { Env, JobRecord } from '../lib/types';
import { normalize, canonicalKey, applyUrlHost } from '../lib/normalize';
import { resolveCollision } from '../lib/dedup';
import { ulid } from '../lib/ulid';
import { TechmapClient, parseSearchPayload } from './techmap';
import { mapTechmapJob } from './mapper';

export const TECHMAP_SOURCE_ID = 'techmap';
const TECHMAP_PRECEDENCE = 3; // general aggregator

export interface IngestConfig {
  day: string; // YYYY-MM-DD; both the dateCreated query and the freshness stamp
  fohTitleQuery: string;
  maxPagesPerCity: number;
  metroSlugs?: string[]; // restrict the run (e.g. San Diego only); default: all test+launch metros
}

export interface IngestSummary {
  runId: string;
  ok: boolean;
  recordsSeen: number;
  recordsNew: number;
  recordsUpdated: number;
  errors: string[];
  unmappedKeys: string[];
  costUnits: number;
}

interface MetroRow {
  slug: string;
  state: string;
  cities_json: string;
}

interface TransformCounts {
  seen: number;
  inserted: number;
  updated: number;
  skipped: number;
  unmappedKeys: string[];
}

export function rawArchiveKey(day: string, metroSlug: string, city: string, page: number): string {
  return `raw/${TECHMAP_SOURCE_ID}/${day}/${metroSlug}/${city.replace(/\s+/g, '-')}/page-${page}.json`;
}

export async function runTechmapIngest(
  env: Env,
  client: TechmapClient,
  cfg: IngestConfig
): Promise<IngestSummary> {
  const runId = ulid();
  const startedAt = new Date().toISOString();
  const summary: IngestSummary = {
    runId,
    ok: false,
    recordsSeen: 0,
    recordsNew: 0,
    recordsUpdated: 0,
    errors: [],
    unmappedKeys: [],
    costUnits: 0,
  };

  // Written first so a midway crash still leaves a run record to finalize.
  await env.DB.prepare('INSERT INTO ingest_runs (id, source_id, started_at) VALUES (?, ?, ?)')
    .bind(runId, TECHMAP_SOURCE_ID, startedAt)
    .run();

  const unmapped = new Set<string>();
  try {
    const metros = await loadMetros(env, cfg.metroSlugs);
    for (const metro of metros) {
      const cities = JSON.parse(metro.cities_json) as string[];
      for (const city of cities) {
        try {
          const query = {
            countryCode: 'us',
            city,
            state: metro.state,
            title: cfg.fohTitleQuery,
            dateCreated: cfg.day,
          };
          const total = await client.count(query);
          const pages = Math.min(cfg.maxPagesPerCity, Math.ceil((total ?? 0) / 10));
          for (let page = 1; page <= pages; page++) {
            const result = await client.searchPage(query, page);
            if (result.jobs.length === 0) break;
            const r2Key = rawArchiveKey(cfg.day, metro.slug, city, page);
            await env.RAW.put(r2Key, result.rawText); // archive before transformation
            const counts = await ingestArchivedPayload(env, result.rawText, {
              metroSlug: metro.slug,
              day: cfg.day,
              r2Key,
            });
            summary.recordsSeen += counts.seen;
            summary.recordsNew += counts.inserted;
            summary.recordsUpdated += counts.updated;
            for (const k of counts.unmappedKeys) unmapped.add(k);
          }
        } catch (err) {
          summary.errors.push(`${metro.slug}/${city}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    summary.ok = summary.errors.length === 0;
  } catch (err) {
    summary.errors.push(`run: ${err instanceof Error ? err.message : String(err)}`);
    summary.ok = false;
  } finally {
    summary.unmappedKeys = [...unmapped].sort();
    if (summary.unmappedKeys.length > 0) {
      console.warn(`techmap unmapped vendor fields: ${summary.unmappedKeys.join(', ')}`);
    }
    summary.costUnits = client.requestsMade + client.jobsFetched;
    await env.DB.prepare(
      `UPDATE ingest_runs
       SET finished_at = ?, records_seen = ?, records_new = ?, records_updated = ?,
           errors_count = ?, errors_json = ?, cost_units_consumed = ?, ok = ?
       WHERE id = ?`
    )
      .bind(
        new Date().toISOString(),
        summary.recordsSeen,
        summary.recordsNew,
        summary.recordsUpdated,
        summary.errors.length,
        JSON.stringify(summary.errors),
        summary.costUnits,
        summary.ok ? 1 : 0,
        runId
      )
      .run();
    if (summary.ok) {
      await env.DB.prepare('UPDATE sources SET last_success_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), TECHMAP_SOURCE_ID)
        .run();
    }
  }
  return summary;
}

async function loadMetros(env: Env, only?: string[]): Promise<MetroRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT slug, state, cities_json FROM metros WHERE tier IN ('test', 'launch') ORDER BY slug"
  ).all<MetroRow>();
  return only ? results.filter((m) => only.includes(m.slug)) : results;
}

export interface TransformContext {
  metroSlug: string;
  day: string;
  r2Key: string;
}

// Re-runnable from the R2 archive: pass the archived body and its key. No API access.
export async function ingestArchivedPayload(
  env: Env,
  rawText: string,
  ctx: TransformContext
): Promise<TransformCounts> {
  const counts: TransformCounts = { seen: 0, inserted: 0, updated: 0, skipped: 0, unmappedKeys: [] };
  const unmapped = new Set<string>();
  const { jobs } = parseSearchPayload(rawText);
  for (const raw of jobs) {
    counts.seen += 1;
    const { fields, unmappedKeys } = mapTechmapJob(raw);
    for (const k of unmappedKeys) unmapped.add(k);
    if (fields.titleRaw === null || fields.sourceUrl === null) {
      counts.skipped += 1; // cannot satisfy NOT NULL columns; raw stays in the archive
      continue;
    }
    const incoming: JobRecord = {
      id: ulid(),
      canonicalKey: canonicalKey(fields.employerRaw, fields.titleRaw, ctx.metroSlug),
      titleRaw: fields.titleRaw,
      titleNormalized: normalize(fields.titleRaw),
      roleClass: 'unknown', // Batch 4 classifier
      employerRaw: fields.employerRaw,
      employerNormalized: fields.employerRaw === null ? null : normalize(fields.employerRaw),
      venueType: 'unknown', // Batch 4 classifier
      descriptionHtml: fields.descriptionHtml,
      descriptionText: fields.descriptionText,
      city: fields.city,
      metroSlug: ctx.metroSlug,
      state: fields.state,
      postalCode: fields.postalCode,
      lat: fields.lat,
      lng: fields.lng,
      compensationMin: fields.compensationMin,
      compensationMax: fields.compensationMax,
      compensationUnit: fields.compensationUnit,
      compensationRaw: fields.compensationRaw,
      employmentType: fields.employmentType,
      datePosted: fields.datePosted,
      validThrough: fields.validThrough,
      applyUrl: fields.applyUrl,
      applyUrlHost: applyUrlHost(fields.applyUrl),
      sourceUrl: fields.sourceUrl,
      sourceId: TECHMAP_SOURCE_ID,
      sourcePrecedence: TECHMAP_PRECEDENCE,
      firstSeenAt: ctx.day,
      lastSeenAt: ctx.day,
      status: 'active',
      publishable: false, // set by Batch 4 gates, never at ingest
      rawPayloadR2Key: ctx.r2Key,
      duplicateOfJobId: null,
    };
    const outcome = await upsertJob(env, incoming);
    if (outcome === 'inserted') counts.inserted += 1;
    else if (outcome === 'updated') counts.updated += 1;
  }
  counts.unmappedKeys = [...unmapped].sort();
  return counts;
}

type UpsertOutcome = 'inserted' | 'updated' | 'unchanged';

interface JobRow {
  id: string;
  canonical_key: string;
  apply_url_host: string | null;
  source_id: string;
  source_precedence: number;
  last_seen_at: string;
  duplicate_of_job_id: string | null;
}

async function upsertJob(env: Env, incoming: JobRecord): Promise<UpsertOutcome> {
  // 1. Same listing seen again (same key, source, and apply host — duplicate alternates
  //    included so re-ingesting a collision loser stays idempotent): refresh freshness.
  const same = await env.DB.prepare(
    `SELECT id, canonical_key, apply_url_host, source_id, source_precedence, last_seen_at, duplicate_of_job_id
     FROM jobs WHERE canonical_key = ? AND source_id = ? AND apply_url_host IS ?`
  )
    .bind(incoming.canonicalKey, incoming.sourceId, incoming.applyUrlHost)
    .first<JobRow>();
  if (same) {
    if (same.last_seen_at === incoming.lastSeenAt) return 'unchanged'; // no churn on re-run
    await env.DB.prepare("UPDATE jobs SET last_seen_at = ?, status = 'active' WHERE id = ?")
      .bind(incoming.lastSeenAt, same.id)
      .run();
    return 'updated';
  }

  // 2. Canonical-key collision against the current primary record for the key.
  const primary = await env.DB.prepare(
    `SELECT id, canonical_key, apply_url_host, source_id, source_precedence, last_seen_at, duplicate_of_job_id
     FROM jobs WHERE canonical_key = ? AND duplicate_of_job_id IS NULL`
  )
    .bind(incoming.canonicalKey)
    .first<JobRow>();

  if (!primary) {
    await insertJob(env, incoming);
    return 'inserted';
  }

  const existingStub: JobRecord = {
    ...incoming,
    id: primary.id,
    applyUrlHost: primary.apply_url_host,
    sourceId: primary.source_id,
    sourcePrecedence: primary.source_precedence,
    duplicateOfJobId: null,
  };
  const result = resolveCollision(existingStub, incoming);
  if (result.distinct) {
    await insertJob(env, incoming); // e.g. two venues of one chain: different apply hosts
    return 'inserted';
  }
  if (result.winner.id === incoming.id) {
    // Incoming outranks the stored record: insert it and demote the old primary.
    await insertJob(env, incoming);
    await env.DB.prepare('UPDATE jobs SET duplicate_of_job_id = ? WHERE id = ?')
      .bind(incoming.id, primary.id)
      .run();
    return 'inserted';
  }
  // Incoming loses: retain it as a linked alternate.
  await insertJob(env, { ...incoming, duplicateOfJobId: primary.id });
  return 'inserted';
}

async function insertJob(env: Env, job: JobRecord): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO jobs (
       id, canonical_key, title_raw, title_normalized, role_class,
       employer_raw, employer_normalized, venue_type,
       description_html, description_text,
       city, metro_slug, state, postal_code, lat, lng,
       compensation_min, compensation_max, compensation_unit, compensation_raw,
       employment_type, date_posted, valid_through,
       apply_url, apply_url_host, source_url, source_id, source_precedence,
       first_seen_at, last_seen_at, status, publishable, raw_payload_r2_key, duplicate_of_job_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      job.id,
      job.canonicalKey,
      job.titleRaw,
      job.titleNormalized,
      job.roleClass,
      job.employerRaw,
      job.employerNormalized,
      job.venueType,
      job.descriptionHtml,
      job.descriptionText,
      job.city,
      job.metroSlug,
      job.state,
      job.postalCode,
      job.lat,
      job.lng,
      job.compensationMin,
      job.compensationMax,
      job.compensationUnit,
      job.compensationRaw,
      job.employmentType,
      job.datePosted,
      job.validThrough,
      job.applyUrl,
      job.applyUrlHost,
      job.sourceUrl,
      job.sourceId,
      job.sourcePrecedence,
      job.firstSeenAt,
      job.lastSeenAt,
      job.status,
      job.publishable ? 1 : 0,
      job.rawPayloadR2Key,
      job.duplicateOfJobId
    )
    .run();
}
