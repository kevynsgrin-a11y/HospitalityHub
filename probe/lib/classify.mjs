// Deterministic title/venue classification for the Batch 0 probe.
// Precision over recall: ambiguous titles fall to foh_other/unknown, never to a publishable class.

const SERVER_ALLOW = [
  /\bserver\b/i,
  /\bwait(er|ress|staff)\b/i,
  /\bfood server\b/i,
  /\bcocktail server\b/i, // captured but see denylist note: cocktail server is FOH-other per spec
];

const BARTENDER_ALLOW = [/\bbartender\b/i, /\bbar tender\b/i, /\bbartending\b/i];

const DENY_TO_OTHER = [
  /\bassistant\b/i, // "Server Assistant" is not server
  /\bmanager\b/i, // "Bar Manager" is management
  /\bbarback\b/i,
  /\bbar back\b/i,
  /\bbusser\b/i,
  /\brunner\b/i,
  /\bhost(ess)?\b/i,
  /\bbarista\b/i,
  /\blead\b/i,
  /\bsupervisor\b/i,
  /\bbanquet\b/i,
  /\bcocktail\b/i,
  /\bcatering\b/i,
  /\bit server\b/i,
  /\bsql server\b/i,
  /\bserver (engineer|admin|administrator|developer)\b/i,
  /\bprocess server\b/i,
];

const MGMT = [/\bmanager\b/i, /\bdirector\b/i, /\bsupervisor\b/i, /\bgm\b/i];
const BOH = [/\bcook\b/i, /\bchef\b/i, /\bdishwash\b/i, /\bprep\b/i, /\bkitchen\b/i, /\bbaker\b/i, /\bporter\b/i];
const FOH_OTHER = [/\bhost(ess)?\b/i, /\bbusser\b/i, /\bbarback\b/i, /\bbar back\b/i, /\brunner\b/i, /\bbarista\b/i, /\bcocktail server\b/i];

export function classifyRole(titleRaw) {
  const t = (titleRaw || '').toLowerCase();
  if (!t) return 'unknown';
  if (MGMT.some((r) => r.test(t))) return 'management';
  if (BOH.some((r) => r.test(t))) return 'boh';
  if (FOH_OTHER.some((r) => r.test(t))) return 'foh_other';
  if (DENY_TO_OTHER.some((r) => r.test(t))) return 'foh_other';
  if (BARTENDER_ALLOW.some((r) => r.test(t))) return 'bartender';
  if (SERVER_ALLOW.some((r) => r.test(t))) return 'server';
  return 'unknown';
}

const RESTAURANT_HINTS = [/\brestaurant\b/i, /\bgrill\b/i, /\bbistro\b/i, /\bdiner\b/i, /\beatery\b/i, /\bpizzeria\b/i, /\bsteakhouse\b/i, /\bcantina\b/i, /\btaqueria\b/i, /\bcafe\b/i, /\btrattoria\b/i, /\bkitchen\b/i, /\bsushi\b/i, /\bbbq\b/i];
const BAR_HINTS = [/\bbar\b/i, /\bpub\b/i, /\btavern\b/i, /\blounge\b/i, /\bbrewery\b/i, /\bbrewing\b/i, /\btaproom\b/i, /\bcocktail\b/i, /\bsaloon\b/i, /\bwinery\b/i, /\bwine bar\b/i];
const HOTEL_HINTS = [/\bhotel\b/i, /\bresort\b/i, /\binn\b/i, /\bmarriott\b/i, /\bhilton\b/i, /\bhyatt\b/i];
const CASINO_HINTS = [/\bcasino\b/i];
const CATERING_HINTS = [/\bcatering\b/i, /\bbanquet\b/i, /\bevents?\b/i];

export function classifyVenue(employerRaw, descriptionText) {
  const s = `${employerRaw || ''} ${descriptionText || ''}`.toLowerCase().slice(0, 2000);
  if (!s.trim()) return 'unknown';
  if (CASINO_HINTS.some((r) => r.test(s))) return 'casino';
  if (HOTEL_HINTS.some((r) => r.test(s))) return 'hotel';
  if (CATERING_HINTS.some((r) => r.test(s))) return 'catering';
  if (BAR_HINTS.some((r) => r.test(s))) return 'bar';
  if (RESTAURANT_HINTS.some((r) => r.test(s))) return 'restaurant';
  return 'unknown';
}

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\b(llc|inc|incorporated|corp|corporation|co|ltd)\b\.?/g, '')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalKey(employer, title, metroSlug) {
  return `${normalize(employer)}|${normalize(title)}|${metroSlug}`;
}
