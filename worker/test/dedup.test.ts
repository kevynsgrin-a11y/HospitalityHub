import { describe, expect, it } from 'vitest';
import { resolveCollision } from '../src/lib/dedup';
import { canonicalKey } from '../src/lib/normalize';
import type { JobRecord } from '../src/lib/types';

function job(overrides: Partial<JobRecord>): JobRecord {
  return {
    id: 'JOB',
    canonicalKey: canonicalKey('Chain House', 'Bartender', 'san-diego'),
    titleRaw: 'Bartender',
    titleNormalized: 'bartender',
    roleClass: 'bartender',
    employerRaw: 'Chain House',
    employerNormalized: 'chain house',
    venueType: 'bar',
    descriptionHtml: null,
    descriptionText: null,
    city: 'San Diego',
    metroSlug: 'san-diego',
    state: 'CA',
    postalCode: null,
    lat: null,
    lng: null,
    compensationMin: null,
    compensationMax: null,
    compensationUnit: null,
    compensationRaw: null,
    employmentType: null,
    datePosted: null,
    validThrough: null,
    applyUrl: null,
    applyUrlHost: null,
    sourceUrl: 'https://example.com/job',
    sourceId: 'techmap',
    sourcePrecedence: 3,
    firstSeenAt: '2026-08-20T00:00:00Z',
    lastSeenAt: '2026-08-20T00:00:00Z',
    status: 'active',
    publishable: false,
    rawPayloadR2Key: null,
    duplicateOfJobId: null,
    ...overrides,
  };
}

describe('resolveCollision', () => {
  it('higher-precedence (lower rank) incoming record wins; loser retained and linked', () => {
    const aggregator = job({ id: 'A', sourceId: 'techmap', sourcePrecedence: 3 });
    const ats = job({ id: 'B', sourceId: 'harri', sourcePrecedence: 1 });
    const r = resolveCollision(aggregator, ats);
    expect(r.distinct).toBe(false);
    expect(r.winner.id).toBe('B');
    expect(r.loser?.id).toBe('A');
    expect(r.loser?.duplicateOfJobId).toBe('B');
  });

  it('existing record wins on equal or better precedence', () => {
    const ats = job({ id: 'A', sourceId: 'harri', sourcePrecedence: 1 });
    const board = job({ id: 'B', sourceId: 'poached', sourcePrecedence: 2 });
    const r = resolveCollision(ats, board);
    expect(r.winner.id).toBe('A');
    expect(r.loser?.duplicateOfJobId).toBe('A');
  });

  it('two venues of the same chain in the same metro stay distinct via apply-URL host', () => {
    // Same employer name, same title, same metro => same canonical key,
    // but genuinely different venues applying through different hosts.
    const north = job({ id: 'A', applyUrlHost: 'north.chainhouse-jobs.com' });
    const south = job({ id: 'B', applyUrlHost: 'south.chainhouse-jobs.com', sourcePrecedence: 1 });
    const r = resolveCollision(north, south);
    expect(r.distinct).toBe(true);
    expect(r.loser).toBeNull();
  });

  it('throws when canonical keys differ', () => {
    const a = job({ id: 'A' });
    const b = job({ id: 'B', canonicalKey: canonicalKey('Other', 'Server', 'san-diego') });
    expect(() => resolveCollision(a, b)).toThrow();
  });
});
