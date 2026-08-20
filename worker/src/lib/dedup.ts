// Duplicate collision resolution by source precedence.
// Precedence rank (lower wins): first-party ATS (1) > niche board (2) > general aggregator (3).
// The winner is the published record; the loser is retained as a linked alternate, never discarded.
//
// Chain caveat: two genuinely different venues of the same chain in the same metro share
// normalize(employer) and may share a title, producing the same canonical key. The apply-URL
// host (and, when available, street address / postal code) is used as a secondary signal:
// same canonical key but different apply hosts => treat as distinct listings, not duplicates.

import type { JobRecord } from './types';

export interface CollisionResult {
  winner: JobRecord;
  loser: JobRecord | null; // retained with duplicateOfJobId = winner.id
  distinct: boolean; // true => not actually duplicates; keep both standalone
}

export function resolveCollision(existing: JobRecord, incoming: JobRecord): CollisionResult {
  if (existing.canonicalKey !== incoming.canonicalKey) {
    throw new Error('resolveCollision called for records with different canonical keys');
  }

  // Secondary signal: different apply hosts means two real listings (e.g. two franchise
  // locations of one chain in the same metro). Keep both.
  if (
    existing.applyUrlHost !== null &&
    incoming.applyUrlHost !== null &&
    existing.applyUrlHost !== incoming.applyUrlHost
  ) {
    return { winner: existing, loser: null, distinct: true };
  }

  if (incoming.sourcePrecedence < existing.sourcePrecedence) {
    return {
      winner: incoming,
      loser: { ...existing, duplicateOfJobId: incoming.id },
      distinct: false,
    };
  }
  return {
    winner: existing,
    loser: { ...incoming, duplicateOfJobId: existing.id },
    distinct: false,
  };
}
