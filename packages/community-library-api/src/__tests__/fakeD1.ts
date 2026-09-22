import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { D1Database, D1PreparedStatement } from '../index.js';

/**
 * A D1 stand-in over node:sqlite, with the repo's migrations applied.
 *
 * Real SQLite rather than a mock, so the ownership checks are tested against
 * the SQL that production runs -- including the `ON CONFLICT ... WHERE` guard,
 * which a hand-written mock would simply reimplement and agree with.
 */
export function createFakeD1(): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  // dist/__tests__ -> package root -> migrations
  const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(migrations, file), 'utf8'));
  }

  const prepare = (sql: string): D1PreparedStatement => {
    let params: unknown[] = [];
    const stmt: D1PreparedStatement = {
      bind(...values: unknown[]) {
        params = values;
        return stmt;
      },
      async first<T>() {
        return (db.prepare(sql).get(...(params as never[])) as T) ?? null;
      },
      async all<T>() {
        return { success: true, results: db.prepare(sql).all(...(params as never[])) as T[] };
      },
      async run() {
        const r = db.prepare(sql).run(...(params as never[]));
        return { success: true, meta: { changes: Number(r.changes) } };
      }
    };
    return stmt;
  };

  return { prepare, raw: db };
}
