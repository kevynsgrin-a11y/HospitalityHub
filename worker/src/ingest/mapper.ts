// Maps Techmap vendor postings onto the canonical schema.
// Any field the vendor does not supply stays NULL — nothing is inferred or fabricated.
// Vendor keys outside MAPPED_KEYS are reported so they are logged, never silently dropped.
// Classification (role_class / venue_type) is Batch 4; ingest writes 'unknown'.

import type { TechmapJob } from './techmap';

export interface MappedFields {
  titleRaw: string | null;
  employerRaw: string | null;
  descriptionHtml: string | null;
  descriptionText: string | null;
  city: string | null;
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
  sourceUrl: string | null;
  portal: string | null;
}

export interface MapResult {
  fields: MappedFields;
  unmappedKeys: string[];
}

const MAPPED_KEYS = new Set([
  'title',
  'company',
  'city',
  'state',
  'postalCode',
  'portal',
  'dateCreated',
  'validThrough',
  'url',
  'description',
  'html',
  'minSalary',
  'maxSalary',
  'salaryCurrency',
  'salaryPeriod',
  'workType',
  'latitude',
  'longitude',
  'jsonLD',
]);

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function mapTechmapJob(raw: TechmapJob): MapResult {
  const minSalary = num(raw.minSalary);
  const maxSalary = num(raw.maxSalary);
  const salaryPeriod = str(raw.salaryPeriod);
  const salaryCurrency = str(raw.salaryCurrency);
  const compensationRaw =
    minSalary !== null || maxSalary !== null
      ? [minSalary, maxSalary].filter((v) => v !== null).join('-') +
        (salaryCurrency ? ` ${salaryCurrency}` : '') +
        (salaryPeriod ? ` per ${salaryPeriod}` : '')
      : null;

  const applyUrl = str(raw.url) ?? str(raw.jsonLD?.url);

  const fields: MappedFields = {
    titleRaw: str(raw.title),
    employerRaw: str(raw.company),
    descriptionHtml: str(raw.html),
    descriptionText: str(raw.description),
    city: str(raw.city),
    state: str(raw.state),
    postalCode: str(raw.postalCode),
    lat: num(raw.latitude),
    lng: num(raw.longitude),
    compensationMin: minSalary,
    compensationMax: maxSalary,
    compensationUnit: salaryPeriod,
    compensationRaw,
    employmentType: str(raw.workType),
    datePosted: str(raw.dateCreated),
    validThrough: str(raw.validThrough),
    applyUrl,
    sourceUrl: applyUrl,
    portal: str(raw.portal),
  };

  const unmappedKeys = Object.keys(raw).filter((k) => !MAPPED_KEYS.has(k));
  return { fields, unmappedKeys };
}
