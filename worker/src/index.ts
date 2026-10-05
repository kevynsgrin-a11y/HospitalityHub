// Edge worker entrypoint. Batch 2 scope: daily Layer A (Techmap) ingest on the cron
// trigger, configurable via KV. Batch 3 adds Layer B here.
//
// KV configuration keys (CONFIG namespace):
//   ingest_enabled      '0' disables the scheduled ingest (default enabled)
//   ingest_day_lag      days behind today to query, matching vendor freshness lag (default 2)
//   techmap_title_query FOH title query (default: server OR bartender OR waiter OR waitress)
//   techmap_max_pages   max search pages per city per day (default 10)
//   techmap_metros      JSON array of metro slugs to restrict the run (default: all test+launch)

import type { Env } from './lib/types';
import { TechmapClient } from './ingest/techmap';
import { runTechmapIngest } from './ingest/run';

const TECHMAP_BASE_URL = 'https://daily-international-job-postings.p.rapidapi.com';
const TECHMAP_HOST = 'daily-international-job-postings.p.rapidapi.com';

export default {
  async fetch(_req: Request, _env: Env): Promise<Response> {
    return new Response(JSON.stringify({ service: 'hospitalityhub-worker', status: 'scaffold' }), {
      headers: { 'content-type': 'application/json' },
    });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const enabled = (await env.CONFIG.get('ingest_enabled')) ?? '1';
    if (enabled === '0') {
      console.log('scheduled ingest disabled via KV ingest_enabled=0');
      return;
    }
    if (!env.TECHMAP_API_KEY) {
      console.error('scheduled ingest skipped: TECHMAP_API_KEY secret is not set');
      return;
    }
    const dayLag = Number((await env.CONFIG.get('ingest_day_lag')) ?? '2');
    const day = new Date(Date.now() - dayLag * 86_400_000).toISOString().slice(0, 10);
    const fohTitleQuery =
      (await env.CONFIG.get('techmap_title_query')) ?? 'server OR bartender OR waiter OR waitress';
    const maxPagesPerCity = Number((await env.CONFIG.get('techmap_max_pages')) ?? '10');
    const metrosRaw = await env.CONFIG.get('techmap_metros');
    const metroSlugs = metrosRaw ? (JSON.parse(metrosRaw) as string[]) : undefined;

    const client = new TechmapClient({
      baseUrl: TECHMAP_BASE_URL,
      host: TECHMAP_HOST,
      apiKey: env.TECHMAP_API_KEY,
    });
    ctx.waitUntil(
      runTechmapIngest(env, client, {
        day,
        fohTitleQuery,
        maxPagesPerCity,
        ...(metroSlugs ? { metroSlugs } : {}),
      }).then((summary) => {
        console.log(
          `techmap ingest run=${summary.runId} ok=${summary.ok} seen=${summary.recordsSeen} ` +
            `new=${summary.recordsNew} updated=${summary.recordsUpdated} ` +
            `errors=${summary.errors.length} cost=${summary.costUnits}`
        );
      })
    );
  },
} satisfies ExportedHandler<Env>;
