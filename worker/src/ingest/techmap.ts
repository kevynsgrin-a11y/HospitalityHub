// Typed Techmap (jobdatafeeds.com via RapidAPI) client for Layer A ingestion.
// /api/v2/jobs/count does not consume job-fetch quota; /api/v2/jobs/search returns
// up to 10 postings per page. Cost accounting: every HTTP request is one request unit,
// and each posting returned by /search is one job-fetch unit.
//
// Licensing: see docs/LICENSING.md before enabling ingestion.

export interface TechmapQuery {
  countryCode: string;
  city?: string;
  state?: string;
  title?: string;
  dateCreated?: string; // YYYY-MM-DD
}

// Vendor posting shape. Only fields observed in vendor docs/probe responses are typed;
// everything else surfaces through the index signature and is reported as unmapped.
export interface TechmapJob {
  title?: string;
  company?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  portal?: string;
  dateCreated?: string;
  validThrough?: string;
  url?: string;
  description?: string;
  html?: string;
  minSalary?: number;
  maxSalary?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  workType?: string;
  latitude?: number;
  longitude?: number;
  jsonLD?: { url?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface TechmapSearchPage {
  jobs: TechmapJob[];
  totalCount: number | null;
  rawText: string; // exact response body — archive this before any transformation
}

export interface HttpResponse {
  status: number;
  text: string;
}

export type HttpGet = (url: string, headers: Record<string, string>) => Promise<HttpResponse>;

export interface TechmapClientOptions {
  baseUrl: string;
  host: string;
  apiKey: string;
  httpGet?: HttpGet; // injectable for fixture-based tests
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

const defaultHttpGet: HttpGet = async (url, headers) => {
  const res = await fetch(url, { headers });
  return { status: res.status, text: await res.text() };
};

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class TechmapClient {
  readonly baseUrl: string;
  readonly host: string;
  private readonly apiKey: string;
  private readonly httpGet: HttpGet;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  requestsMade = 0;
  jobsFetched = 0;

  constructor(opts: TechmapClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.host = opts.host;
    this.apiKey = opts.apiKey;
    this.httpGet = opts.httpGet ?? defaultHttpGet;
    this.sleep = opts.sleep ?? defaultSleep;
    this.maxRetries = opts.maxRetries ?? 5;
  }

  private async get(path: string, params: Record<string, string | number | undefined>): Promise<string> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    let attempt = 0;
    for (;;) {
      const res = await this.httpGet(url.toString(), {
        'x-rapidapi-key': this.apiKey,
        'x-rapidapi-host': this.host,
      });
      this.requestsMade += 1;
      if (res.status === 429 || res.status >= 500) {
        attempt += 1;
        if (attempt > this.maxRetries) {
          throw new Error(`Techmap ${path} failed after ${this.maxRetries} retries: HTTP ${res.status}`);
        }
        await this.sleep(Math.min(60_000, 2 ** attempt * 1000));
        continue;
      }
      if (res.status !== 200) {
        throw new Error(`Techmap ${path} HTTP ${res.status}: ${res.text.slice(0, 300)}`);
      }
      return res.text;
    }
  }

  async count(query: TechmapQuery): Promise<number | null> {
    const text = await this.get('/api/v2/jobs/count', { ...query });
    return extractTotal(JSON.parse(text));
  }

  async searchPage(query: TechmapQuery, page: number): Promise<TechmapSearchPage> {
    const rawText = await this.get('/api/v2/jobs/search', { ...query, page });
    const parsed = parseSearchPayload(rawText);
    this.jobsFetched += parsed.jobs.length;
    return { ...parsed, rawText };
  }
}

// Parsing is separated from the client so transformation can be re-run from the
// R2 archive without touching (or re-billing) the API.
export function parseSearchPayload(rawText: string): { jobs: TechmapJob[]; totalCount: number | null } {
  const json = JSON.parse(rawText) as Record<string, unknown>;
  const jobs = (json['result'] ?? json['jobs'] ?? json['data'] ?? []) as TechmapJob[];
  return { jobs, totalCount: extractTotal(json) };
}

function extractTotal(json: Record<string, unknown>): number | null {
  const v = json['totalCount'] ?? json['count'] ?? json['total'];
  return typeof v === 'number' ? v : null;
}
