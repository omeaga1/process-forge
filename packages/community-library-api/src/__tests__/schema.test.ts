import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler, type Env } from '../index.js';
import { ensureSchema, statementsOf } from '../schema.js';
import { MIGRATIONS } from '../migrations.generated.js';
import { createFakeD1 } from './fakeD1.js';

const tables = (db: ReturnType<typeof createFakeD1>) =>
  (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);

describe('The worker applies its own schema changes', () => {
  it('ships every migration in the directory (run pnpm migrations:gen after adding one)', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    assert.deepEqual(MIGRATIONS.map((m) => m.name), files.map((f) => f.replace(/\.sql$/, '')));
    for (const f of files) {
      const m = MIGRATIONS.find((x) => x.name === f.replace(/\.sql$/, ''))!;
      assert.equal(m.sql, readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n'), `${f} is current`);
    }
  });

  it('brings a production-shaped database (hand-applied through 0003) up to date on the first request', async () => {
    const DB = createFakeD1({ upTo: '0003_unitop_versions' });
    assert.ok(!tables(DB).includes('user_unitops'));
    const env = { DB, ENVIRONMENT: 'test', ALLOWED_ORIGIN: '*', GOOGLE_CLIENT_IDS: 'x', SESSION_SECRET: 'x'.repeat(48) } as Env;
    const res = await createHandler()(new Request('https://api.test/api/health'), env);
    const body = (await res.json()) as { schema: string };
    assert.equal(res.status, 200);
    assert.equal(body.schema, MIGRATIONS.at(-1)!.name);
    assert.ok(tables(DB).includes('user_unitops'));
    const recorded = (DB.raw.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name);
    assert.ok(recorded.includes('0004_user_unitops'));
    assert.ok(!recorded.includes('0003_unitop_versions'), 'the hand-applied baseline is never re-run');
  });

  it('runs each migration once, and a later migration is harmless on a database that already has it', async () => {
    const DB = createFakeD1();
    assert.deepEqual(await ensureSchema(DB), ['0004_user_unitops']);
    assert.deepEqual(await ensureSchema(DB), ['0004_user_unitops'], 'remembered for this worker instance');
    const fresh = { prepare: DB.prepare };
    assert.deepEqual(await ensureSchema(fresh), [], 'a new instance finds it recorded');
  });

  it('splits a migration into statements, without its comments', () => {
    assert.deepEqual(statementsOf('-- note; with a semicolon\nCREATE TABLE a (x TEXT);\nCREATE INDEX i ON a(x);\n'), ['CREATE TABLE a (x TEXT)', 'CREATE INDEX i ON a(x)']);
  });
});
