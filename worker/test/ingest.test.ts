// Batch 2 integration tests: recorded fixtures only — no live API calls.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TechmapClient, type HttpGet } from '../src/ingest/techmap';
import { mapTechmapJob } from '../src/ingest/mapper';
import { runTechmapIngest, ingestArchivedPayload } from '../src/ingest/run';
import { makeFakeEnv } from './helpers/fakeEnv';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const DAY = '2026-08-18';

function fixtureHttp(overrides?: { failOnPage?: number; rateLimitFirst?: number }): {
  httpGet: HttpGet;
  calls: string[];
} {
  const calls: string[] = [];
  let rateLimitsLeft = overrides?.rateLimitFirst ?? 0;
  const httpGet: HttpGet = async (url) => {
    calls.push(url);
    if (rateLimitsLeft > 0) {
      rateLimitsLeft -= 1;
      return { status: 429, text: 'rate limited' };
    }
    const u = new URL(url);
    if (u.pathname.endsWith('/jobs/count')) {
      if (u.searchParams.get('city')?.toLowerCase() !== 'san diego') return { status: 200, text: '{"totalCount":0}' };
      return { status: 200, text: fixture('techmap_count_san-diego.json') };
    }
    const page = Number(u.searchParams.get('page'));
    if (overrides?.failOnPage === page) return { status: 500, text: 'boom' };
    if (page === 1) return { status: 200, text: fixture('techmap_search_san-diego_p1.json') };
    if (page === 2) return { status: 200, text: fixture('techmap_search_san-diego_p2.json') };
    return { status: 200, text: '{"totalCount":13,"result":[]}' };
  };
  return { httpGet, calls };
}

function makeClient(httpGet: HttpGet): TechmapClient {
  return new TechmapClient({
    baseUrl: 'https://techmap.test',
    host: 'techmap.test',
    apiKey: 'fixture-key',
    httpGet,
    sleep: async () => {},
  });
}

const CFG = { day: DAY, fohTitleQuery: 'server OR bartender', maxPagesPerCity: 5, metroSlugs: ['san-diego'] };

describe('full San Diego run', () => {
  it('populates jobs from fixtures and archives every payload before transformation', async () => {
    const { env, d1, r2 } = makeFakeEnv();
    const summary = await runTechmapIngest(env, makeClient(fixtureHttp().httpGet), CFG);

    expect(summary.ok).toBe(true);
    expect(summary.recordsSeen).toBe(13);
    expect(summary.recordsNew).toBe(12); // one posting has no URL and is skipped
    expect(summary.errors).toEqual([]);
    expect(summary.costUnits).toBeGreaterThan(0);
    expect(summary.unmappedKeys).toEqual(['language', 'occupation']); // logged, not dropped

    const rows = d1.db.prepare('SELECT * FROM jobs').all() as Record<string, unknown>[];
    expect(rows).toHaveLength(12);
    // Every row traces back to an archived raw payload.
    for (const row of rows) {
      const key = row['raw_payload_r2_key'] as string;
      expect(r2.objects.has(key)).toBe(true);
    }
    // Vendor-absent fields stay NULL; sourced compensation is kept.
    const paid = rows.filter((r) => r['compensation_min'] !== null);
    expect(paid).toHaveLength(1);
    expect(paid[0]?.['compensation_unit']).toBe('hour');
    const noEmployer = rows.filter((r) => r['employer_raw'] === null);
    expect(noEmployer).toHaveLength(1);
    // Ingest never classifies or publishes.
    expect(rows.every((r) => r['role_class'] === 'unknown' && r['publishable'] === 0)).toBe(true);
  });

  it('is idempotent: a second identical run adds no rows and causes no last_seen_at churn', async () => {
    const { env, d1 } = makeFakeEnv();
    await runTechmapIngest(env, makeClient(fixtureHttp().httpGet), CFG);
    const before = d1.db.prepare('SELECT id, last_seen_at FROM jobs ORDER BY id').all();

    const second = await runTechmapIngest(env, makeClient(fixtureHttp().httpGet), CFG);
    expect(second.recordsNew).toBe(0);
    expect(second.recordsUpdated).toBe(0);
    const after = d1.db.prepare('SELECT id, last_seen_at FROM jobs ORDER BY id').all();
    expect(after).toEqual(before);
  });

  it('keeps two venues of one chain (same key, different apply hosts) as distinct rows', async () => {
    const { env, d1 } = makeFakeEnv();
    await runTechmapIngest(env, makeClient(fixtureHttp().httpGet), CFG);
    const chain = d1.db
      .prepare("SELECT apply_url_host, duplicate_of_job_id FROM jobs WHERE employer_normalized = 'harbor house restaurant' AND title_normalized = 'server'")
      .all() as { apply_url_host: string; duplicate_of_job_id: string | null }[];
    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(new Set(chain.map((r) => r.apply_url_host)).size).toBe(chain.length);
    expect(chain.every((r) => r.duplicate_of_job_id === null)).toBe(true);
  });

  it('writes a complete ingest_runs record even when the run fails midway', async () => {
    const { env, d1 } = makeFakeEnv();
    const client = makeClient(fixtureHttp({ failOnPage: 2 }).httpGet);
    const summary = await runTechmapIngest(env, client, CFG);

    expect(summary.ok).toBe(false);
    expect(summary.errors.length).toBe(1);
    expect(summary.recordsSeen).toBe(10); // page 1 still landed

    const run = d1.db.prepare('SELECT * FROM ingest_runs WHERE id = ?').get(summary.runId) as Record<string, unknown>;
    expect(run['finished_at']).not.toBeNull();
    expect(run['ok']).toBe(0);
    expect(run['errors_count']).toBe(1);
    expect(JSON.parse(run['errors_json'] as string)).toHaveLength(1);
    expect(run['records_seen']).toBe(10);
    expect(run['cost_units_consumed']).toBeGreaterThan(0);
  });

  it('records cost units per run in ingest_runs', async () => {
    const { env, d1 } = makeFakeEnv();
    const summary = await runTechmapIngest(env, makeClient(fixtureHttp().httpGet), CFG);
    const run = d1.db.prepare('SELECT cost_units_consumed FROM ingest_runs WHERE id = ?').get(summary.runId) as {
      cost_units_consumed: number;
    };
    // requests (count + non-empty search pages + one empty page probe is avoided by pages calc) + 13 postings
    expect(run.cost_units_consumed).toBe(summary.costUnits);
    expect(run.cost_units_consumed).toBeGreaterThanOrEqual(13);
  });
});

describe('unknown count response', () => {
  it('still fetches pages (until empty) when the count total is unreadable', async () => {
    const { env, d1 } = makeFakeEnv();
    const base = fixtureHttp().httpGet;
    const httpGet: HttpGet = async (url, headers) => {
      if (new URL(url).pathname.endsWith('/jobs/count')) return { status: 200, text: '{"unexpected":true}' };
      return base(url, headers);
    };
    const summary = await runTechmapIngest(env, makeClient(httpGet), CFG);
    expect(summary.ok).toBe(true);
    expect(summary.recordsSeen).toBe(13);
    expect((d1.db.prepare('SELECT COUNT(*) AS n FROM jobs').get() as { n: number }).n).toBe(12);
  });
});

describe('retries and rate limits', () => {
  it('retries 429 responses with backoff and succeeds', async () => {
    const { env } = makeFakeEnv();
    const { httpGet, calls } = fixtureHttp({ rateLimitFirst: 2 });
    const summary = await runTechmapIngest(env, makeClient(httpGet), CFG);
    expect(summary.ok).toBe(true);
    expect(calls.length).toBeGreaterThan(3); // includes the retried attempts
  });

  it('fails a city (not the run) when retries are exhausted', async () => {
    const { env, d1 } = makeFakeEnv();
    const httpGet: HttpGet = async () => ({ status: 500, text: 'down' });
    const client = new TechmapClient({
      baseUrl: 'https://techmap.test',
      host: 'techmap.test',
      apiKey: 'fixture-key',
      httpGet,
      sleep: async () => {},
      maxRetries: 1,
    });
    const summary = await runTechmapIngest(env, client, CFG);
    expect(summary.ok).toBe(false);
    expect(summary.errors[0]).toContain('san-diego/San Diego');
    const run = d1.db.prepare('SELECT ok FROM ingest_runs WHERE id = ?').get(summary.runId) as { ok: number };
    expect(run.ok).toBe(0);
  });
});

describe('re-running transformation from the archive', () => {
  it('replays archived payloads into identical rows without any API client', async () => {
    const { env, d1, r2 } = makeFakeEnv();
    await runTechmapIngest(env, makeClient(fixtureHttp().httpGet), CFG);
    const rowsBefore = d1.db.prepare('SELECT * FROM jobs ORDER BY canonical_key, apply_url_host').all();

    for (const [key, body] of r2.objects) {
      const counts = await ingestArchivedPayload(env, body, { metroSlug: 'san-diego', day: DAY, r2Key: key });
      expect(counts.inserted).toBe(0); // nothing re-billed, nothing duplicated
      expect(counts.updated).toBe(0);
    }
    const rowsAfter = d1.db.prepare('SELECT * FROM jobs ORDER BY canonical_key, apply_url_host').all();
    expect(rowsAfter).toEqual(rowsBefore);
  });
});

describe('mapper', () => {
  it('leaves vendor-absent fields NULL and reports unmapped vendor keys', () => {
    const { fields, unmappedKeys } = mapTechmapJob({
      title: 'Server',
      url: 'https://x.example/j/1',
      mysteryField: 'value',
      occupation: 'Waiters',
    });
    expect(fields.employerRaw).toBeNull();
    expect(fields.compensationMin).toBeNull();
    expect(fields.compensationRaw).toBeNull();
    expect(fields.datePosted).toBeNull();
    expect(fields.city).toBeNull();
    expect(unmappedKeys.sort()).toEqual(['mysteryField', 'occupation']);
  });

  it('builds compensation only from sourced salary fields', () => {
    const { fields } = mapTechmapJob({
      title: 'Bartender',
      url: 'https://x.example/j/2',
      minSalary: 20,
      maxSalary: 28,
      salaryCurrency: 'USD',
      salaryPeriod: 'hour',
    });
    expect(fields.compensationMin).toBe(20);
    expect(fields.compensationMax).toBe(28);
    expect(fields.compensationUnit).toBe('hour');
    expect(fields.compensationRaw).toBe('20-28 USD per hour');
  });
});
