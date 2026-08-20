// Minimal Techmap (jobdatafeeds.com) client via RapidAPI.
// /api/v2/jobs/count does not consume job-fetch quota; /api/v2/jobs/search returns 10 postings/page.

export class TechmapClient {
  constructor({ baseUrl, host, apiKey, archive }) {
    this.baseUrl = baseUrl;
    this.host = host;
    this.apiKey = apiKey;
    this.archive = archive; // async (name, payload) => void
    this.requestsMade = 0;
    this.jobsFetched = 0;
  }

  async _get(path, params, archiveName) {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    let attempt = 0;
    for (;;) {
      const res = await fetch(url, {
        headers: {
          'x-rapidapi-key': this.apiKey,
          'x-rapidapi-host': this.host,
        },
      });
      this.requestsMade += 1;
      if (res.status === 429 || res.status >= 500) {
        attempt += 1;
        if (attempt > 5) throw new Error(`Techmap ${path} failed after retries: HTTP ${res.status}`);
        const delay = Math.min(60_000, 2 ** attempt * 1000);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new Error(`Techmap ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
      const json = JSON.parse(text);
      if (this.archive && archiveName) await this.archive(archiveName, text);
      return json;
    }
  }

  async count(params, archiveName) {
    const json = await this._get('/api/v2/jobs/count', params, archiveName);
    // Response shape: { totalCount } or { count } depending on version; keep both.
    return json.totalCount ?? json.count ?? json.total ?? null;
  }

  async searchPage(params, page, archiveName) {
    const json = await this._get('/api/v2/jobs/search', { ...params, page }, archiveName);
    const jobs = json.result ?? json.jobs ?? json.data ?? [];
    this.jobsFetched += jobs.length;
    return { jobs, totalCount: json.totalCount ?? json.count ?? null, raw: json };
  }
}
