import type { D1Database } from './index.js';
import { MIGRATIONS } from './migrations.generated.js';

/**
 * The worker applies its own schema changes, so a deploy is the whole release:
 * nobody runs `wrangler d1 migrations apply` (which Cloudflare refuses on this
 * account with 7403) or pastes SQL into the dashboard.
 *
 * Migrations up to BASELINE were applied by hand in production before this
 * existed and are never run here (0003's ALTER TABLEs would fail the second
 * time). Every later one runs once, recorded in schema_migrations, and must be
 * written to be harmless if it ever runs again (CREATE ... IF NOT EXISTS), since
 * two workers starting together can both apply it.
 */
export const BASELINE = '0003_unitop_versions';

/** A migration's statements: comments dropped, split at the semicolons ending lines. */
export function statementsOf(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const applied = new WeakMap<D1Database, Promise<string[]>>();

/**
 * Brings the database up to date, once per worker instance and database.
 * Resolves to the names of the migrations this call applied. A failure is not
 * remembered, so the next request tries again.
 */
export function ensureSchema(db: D1Database): Promise<string[]> {
  let p = applied.get(db);
  if (!p) {
    p = migrate(db).catch((e) => {
      applied.delete(db);
      throw e;
    });
    applied.set(db, p);
  }
  return p;
}

async function migrate(db: D1Database): Promise<string[]> {
  await db.prepare('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)').run();
  const done = new Set(
    ((await db.prepare('SELECT name FROM schema_migrations').all<{ name: string }>()).results ?? []).map((r) => r.name)
  );
  const ran: string[] = [];
  for (const m of MIGRATIONS) {
    if (m.name <= BASELINE || done.has(m.name)) continue;
    for (const statement of statementsOf(m.sql)) await db.prepare(statement).run();
    await db.prepare('INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)').bind(m.name, new Date().toISOString()).run();
    ran.push(m.name);
  }
  return ran;
}

/** The newest migration this worker knows, for /api/health. */
export const SCHEMA_VERSION = MIGRATIONS.at(-1)?.name ?? 'none';
