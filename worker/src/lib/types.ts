// Canonical job record and registry types. Mirrors migrations/0001_init.sql.

export type RoleClass = 'server' | 'bartender' | 'foh_other' | 'boh' | 'management' | 'unknown';
export type VenueType = 'restaurant' | 'bar' | 'hotel' | 'casino' | 'catering' | 'other' | 'unknown';
export type JobStatus = 'active' | 'stale' | 'expired';
export type MetroTier = 'test' | 'launch' | 'measurement_only';
export type SourceKind = 'first_party_ats' | 'niche_board' | 'general_aggregator';

export interface JobRecord {
  id: string; // ULID
  canonicalKey: string;
  titleRaw: string;
  titleNormalized: string;
  roleClass: RoleClass;
  employerRaw: string | null;
  employerNormalized: string | null;
  venueType: VenueType;
  descriptionHtml: string | null;
  descriptionText: string | null;
  city: string | null;
  metroSlug: string | null;
  state: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  compensationMin: number | null;
  compensationMax: number | null;
  compensationUnit: string | null;
  compensationRaw: string | null;
  employmentType: string | null;
  datePosted: string | null;
  validThrough: string | null;
  applyUrl: string | null;
  applyUrlHost: string | null;
  sourceUrl: string;
  sourceId: string;
  sourcePrecedence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: JobStatus;
  publishable: boolean;
  rawPayloadR2Key: string | null;
  duplicateOfJobId: string | null;
}

export interface Metro {
  slug: string;
  displayName: string;
  state: string;
  tier: MetroTier;
  cities: string[];
  publishable: boolean;
}

export interface Source {
  id: string;
  displayName: string;
  kind: SourceKind;
  precedence: number; // lower wins
  enabled: boolean;
}

export interface Env {
  DB: D1Database;
  CONFIG: KVNamespace;
  RAW: R2Bucket;
  TECHMAP_API_KEY?: string;
  FANTASTIC_JOBS_API_KEY?: string;
}
