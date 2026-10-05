// Edge worker entrypoint. Batch 1 scope: bindings and structure only — no ingestion yet.
// The scheduled handler becomes the daily ingest cycle in Batch 2 (Layer A) and Batch 3 (Layer B).

import type { Env } from './lib/types';

export default {
  async fetch(_req: Request, _env: Env): Promise<Response> {
    return new Response(JSON.stringify({ service: 'hospitalityhub-worker', status: 'scaffold' }), {
      headers: { 'content-type': 'application/json' },
    });
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // Batch 2 wires the Layer A ingest here. Schedule tuning lives in KV.
    const schedule = await env.CONFIG.get('ingest_schedule');
    console.log(`scheduled tick (ingest not yet implemented); kv ingest_schedule=${schedule ?? 'unset'}`);
  },
} satisfies ExportedHandler<Env>;
