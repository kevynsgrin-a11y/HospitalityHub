// Canonical-key normalization for deduplication:
//   canonicalKey = normalize(employer) | normalize(title) | metroSlug
// normalize() lowercases, strips punctuation and legal suffixes (LLC, Inc, ...),
// and collapses whitespace. The apply-URL host is a secondary signal only.

const LEGAL_SUFFIXES = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|ltd|limited|lp|llp)\b\.?/g;

export function normalize(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalKey(
  employer: string | null | undefined,
  title: string | null | undefined,
  metroSlug: string
): string {
  return `${normalize(employer)}|${normalize(title)}|${metroSlug}`;
}

export function applyUrlHost(applyUrl: string | null | undefined): string | null {
  if (!applyUrl) return null;
  try {
    return new URL(applyUrl).host.toLowerCase();
  } catch {
    return null;
  }
}
