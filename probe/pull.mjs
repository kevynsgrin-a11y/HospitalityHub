#!/usr/bin/env node
// Batch 0 coverage probe — daily pull. Throwaway script, excluded from any production build.
//
// Usage: TECHMAP_API_KEY=... node probe/pull.mjs [YYYY-MM-DD]
// Defaults to (today - 2 days) UTC, matching the API's freshness lag.
//
// Quota strategy (free tier):
//   - /jobs/count is used for all volume figures (does not consume job-fetch quota).
//   - /jobs/search fetches actual FOH postings for classification/dedup/portal attribution,
//     capped per market via PAGES_TEST / PAGES_LAUNCH env vars.
//   - California statewide is count-only (measurement tier).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TechmapClient } from './lib/techmap.mjs';
import { classifyRole, classifyVenue, canonicalKey } from './lib/classify.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

const day =
  process.argv[2] ??
  new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  console.error(`Invalid date: ${day}`);
  process.exit(1);
}

const apiKey = process.env.TECHMAP_API_KEY;
if (!apiKey) {
  console.error('TECHMAP_API_KEY is required');
  process.exit(1);
}

const PAGES_TEST = Number(process.env.PAGES_TEST ?? config.techmap.maxSearchPagesPerMarket);
const PAGES_LAUNCH = Number(process.env.PAGES_LAUNCH ?? 3);

const archiveDir = path.join(ROOT, 'archive', day, 'techmap');
fs.mkdirSync(archiveDir, { recursive: true });
const archive = async (name, payload) => {
  fs.writeFileSync(path.join(archiveDir, `${name}.json`), payload);
};

const client = new TechmapClient({ ...config.techmap, apiKey, archive });

const dataDir = path.join(ROOT, 'data');
const keysDir = path.join(dataDir, 'keys');
const dailyDir = path.join(dataDir, 'daily');
fs.mkdirSync(keysDir, { recursive: true });
fs.mkdirSync(dailyDir, { recursive: true });

function loadKeys(slug) {
  const p = path.join(keysDir, `${slug}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
}
function saveKeys(slug, keys) {
  fs.writeFileSync(path.join(keysDir, `${slug}.json`), JSON.stringify(keys, null, 1));
}

function mapJob(raw) {
  // Defensive mapping; unmapped fields are preserved via the raw archive.
  return {
    title: raw.title ?? raw.jobTitle ?? null,
    company: raw.company ?? raw.companyName ?? raw.hiringOrganization?.name ?? null,
    city: raw.city ?? raw.jobLocation?.address?.addressLocality ?? null,
    state: raw.state ?? raw.jobLocation?.address?.addressRegion ?? null,
    portal: raw.portal ?? raw.source ?? null,
    dateCreated: raw.dateCreated ?? raw.datePosted ?? null,
    url: raw.url ?? raw.jsonLD?.url ?? null,
    description: raw.description ?? raw.text ?? '',
  };
}

async function probeMarket(market) {
  const base = { countryCode: 'us', dateCreated: day };
  const out = {
    slug: market.slug,
    tier: market.tier,
    total: 0,
    fohTitleCount: 0,
    fetched: 0,
    server: 0,
    bartender: 0,
    fohOther: 0,
    restaurantBar: 0,
    uniqueEmployers: 0,
    dupesVsPriorDays: 0,
    newKeys: 0,
    portals: {},
    errors: [],
  };
  const maxPages = market.tier === 'test' ? PAGES_TEST : PAGES_LAUNCH;
  const keys = loadKeys(market.slug);
  const employers = new Set();

  for (const city of market.cities) {
    const cityParams = { ...base, city, state: market.state };
    const tag = `${market.slug}_${city.replace(/\s+/g, '-')}`;
    try {
      const total = await client.count(cityParams, `count_${tag}`);
      out.total += total ?? 0;
      const fohParams = { ...cityParams, title: config.techmap.fohTitleQuery };
      const fohCount = await client.count(fohParams, `count_foh_${tag}`);
      out.fohTitleCount += fohCount ?? 0;

      const pages = Math.min(maxPages, Math.ceil((fohCount ?? 0) / 10));
      for (let page = 1; page <= pages; page++) {
        const { jobs } = await client.searchPage(fohParams, page, `search_foh_${tag}_p${page}`);
        if (!jobs.length) break;
        for (const rawJob of jobs) {
          const j = mapJob(rawJob);
          out.fetched += 1;
          const role = classifyRole(j.title);
          if (role === 'server') out.server += 1;
          else if (role === 'bartender') out.bartender += 1;
          else out.fohOther += 1;
          const venue = classifyVenue(j.company, j.description);
          if (venue === 'restaurant' || venue === 'bar') out.restaurantBar += 1;
          if (j.company) employers.add(j.company.toLowerCase().trim());
          if (j.portal) out.portals[j.portal] = (out.portals[j.portal] ?? 0) + 1;
          const key = canonicalKey(j.company, j.title, market.slug);
          if (keys[key]) {
            out.dupesVsPriorDays += 1;
            keys[key].lastSeen = day;
          } else {
            out.newKeys += 1;
            keys[key] = { firstSeen: day, lastSeen: day, portal: j.portal };
          }
        }
      }
    } catch (err) {
      out.errors.push(`${city}: ${err.message}`);
    }
  }
  out.uniqueEmployers = employers.size;
  saveKeys(market.slug, keys);
  return out;
}

async function main() {
  const started = new Date().toISOString();
  const results = [];
  for (const market of config.markets) {
    console.log(`Probing ${market.slug}...`);
    results.push(await probeMarket(market));
  }

  // California statewide: measurement-only, counts only.
  const sw = config.statewide;
  const swOut = { slug: sw.slug, tier: sw.tier, total: null, fohTitleCount: null, errors: [] };
  try {
    swOut.total = await client.count(
      { countryCode: 'us', state: sw.state, dateCreated: day },
      `count_${sw.slug}`
    );
    swOut.fohTitleCount = await client.count(
      { countryCode: 'us', state: sw.state, dateCreated: day, title: config.techmap.fohTitleQuery },
      `count_foh_${sw.slug}`
    );
  } catch (err) {
    swOut.errors.push(err.message);
  }
  results.push(swOut);

  const record = {
    day,
    started,
    finished: new Date().toISOString(),
    requestsMade: client.requestsMade,
    jobsFetched: client.jobsFetched,
    markets: results,
  };
  fs.writeFileSync(path.join(dailyDir, `${day}.json`), JSON.stringify(record, null, 2));

  const csvPath = path.join(dataDir, 'daily.csv');
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(
      csvPath,
      'day,market,tier,total,foh_title_count,fetched,server,bartender,foh_other,restaurant_bar,unique_employers,dupes_vs_prior,new_keys,errors\n'
    );
  }
  for (const m of results) {
    fs.appendFileSync(
      csvPath,
      [
        day, m.slug, m.tier, m.total ?? '', m.fohTitleCount ?? '', m.fetched ?? '',
        m.server ?? '', m.bartender ?? '', m.fohOther ?? '', m.restaurantBar ?? '',
        m.uniqueEmployers ?? '', m.dupesVsPriorDays ?? '', m.newKeys ?? '',
        (m.errors ?? []).length,
      ].join(',') + '\n'
    );
  }

  console.log(JSON.stringify(record, null, 2));
  console.log(`\nDone. ${client.requestsMade} API requests, ${client.jobsFetched} jobs fetched.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
