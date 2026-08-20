// Test doubles backed by real SQLite (better-sqlite3) so integration tests run the
// same SQL the Worker runs in D1, without live Cloudflare resources or API calls.
// Only the D1/KV/R2 surface the ingest code uses is implemented; the fakes are cast
// to the Cloudflare binding types at the Env boundary.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type { Env } from '../../src/lib/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

class FakePreparedStatement {
  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
    private readonly params: unknown[] = []
  ) {}

  bind(...params: unknown[]): FakePreparedStatement {
    return new FakePreparedStatement(this.db, this.sql, params);
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[]));
    return (row as T | undefined) ?? null;
  }

  async run(): Promise<{ success: boolean }> {
    this.db.prepare(this.sql).run(...(this.params as never[]));
    return { success: true };
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...(this.params as never[])) as T[] };
  }
}

export class FakeD1 {
  readonly db: Database.Database;

  constructor() {
    this.db = new Database(':memory:');
    this.db.exec(fs.readFileSync(path.join(ROOT, 'migrations/0001_init.sql'), 'utf8'));
    this.db.exec(fs.readFileSync(path.join(ROOT, 'seeds/metros.sql'), 'utf8'));
  }

  prepare(sql: string): FakePreparedStatement {
    return new FakePreparedStatement(this.db, sql);
  }
}

export class FakeR2 {
  readonly objects = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.objects.set(key, value);
  }

  async get(key: string): Promise<{ text(): Promise<string> } | null> {
    const v = this.objects.get(key);
    return v === undefined ? null : { text: async () => v };
  }
}

export class FakeKV {
  readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

export interface FakeBindings {
  env: Env;
  d1: FakeD1;
  r2: FakeR2;
  kv: FakeKV;
}

export function makeFakeEnv(): FakeBindings {
  const d1 = new FakeD1();
  const r2 = new FakeR2();
  const kv = new FakeKV();
  const env = {
    DB: d1 as unknown as D1Database,
    CONFIG: kv as unknown as KVNamespace,
    RAW: r2 as unknown as R2Bucket,
  } satisfies Env;
  return { env, d1, r2, kv };
}
