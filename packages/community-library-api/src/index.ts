/**
 * ProcessForge cloud API — Cloudflare Worker + D1.
 *
 * - Community unit-op library: public search and pull; signed-in publish.
 * - Cloud projects: every read, write and delete is scoped to the signed-in
 *   owner. The owner comes from a verified session (see auth.ts), never from
 *   the query string or the request body.
 */

import {
  AuthError,
  bearerToken,
  exchangeGoogleCode,
  fetchGoogleJwks,
  sessionFromClaims,
  signSession,
  verifyGoogleIdToken,
  verifySession,
  type JwksFetcher,
  type Session
} from './auth.js';
import { ProcessNodeSchema, executeValidateUnitOp } from '@process-forge/protocol';

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results?: T[]; success: boolean }>;
  run<T = unknown>(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ALLOWED_ORIGIN: string;
  /** Comma-separated OAuth client IDs whose Google ID tokens we accept. */
  GOOGLE_CLIENT_IDS: string;
  /** HMAC key for session tokens. A secret: `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET: string;
  /** Desktop OAuth client, for the loopback code exchange. Optional. */
  GOOGLE_DESKTOP_CLIENT_ID?: string;
  GOOGLE_DESKTOP_CLIENT_SECRET?: string;
}

export interface UnitOpRecord {
  id: string;
  name: string;
  author_id: string;
  author_name: string;
  category: 'PACKAGING' | 'FLUID_PROCESSING' | 'MATERIAL_HANDLING' | 'QUALITY';
  description: string;
  version: string;
  rating: number;
  download_count: number;
  asme_rating?: string;
  tags?: string;
  bundle_json: string;
  created_at: string;
  updated_at?: string;
  status?: 'published' | 'unpublished';
  engine_checked?: number;
  release_notes?: string | null;
}

interface PublishBody {
  name?: string;
  category?: string;
  description?: string;
  tags?: string | string[];
  bundle?: unknown;
  /** PUT only: the new version; by default the next minor version. */
  version?: string;
  releaseNotes?: string;
}

const CATEGORIES = ['PACKAGING', 'FLUID_PROCESSING', 'MATERIAL_HANDLING', 'QUALITY'];
const LISTING_COLUMNS =
  'id, name, author_id, author_name, category, description, version, download_count, tags, status, engine_checked, release_notes, created_at, updated_at';

function checkListing(body: PublishBody, isNew: boolean): string | null {
  if (isNew && (!body.name || !body.category || !body.description)) {
    return 'Missing required fields: name, category, and description are required.';
  }
  if (body.category !== undefined && !CATEGORIES.includes(body.category)) {
    return `Invalid category. Must be one of: ${CATEGORIES.join(', ')}`;
  }
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120)) return 'name must be 1 to 120 characters.';
  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 4000)) {
    return 'description must be at most 4000 characters.';
  }
  if (body.releaseNotes !== undefined && (typeof body.releaseNotes !== 'string' || body.releaseNotes.length > 2000)) {
    return 'releaseNotes must be at most 2000 characters.';
  }
  if (isNew && body.bundle === undefined) return 'Missing bundle: the unit to publish.';
  return null;
}

function tagsOf(tags: PublishBody['tags']): string {
  const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  return list.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 12).join(',');
}

/**
 * A listing must be a unit ProcessForge can place. A designed unit's contract
 * must pass the engine's checks (the same gates as validate_unit_op): a
 * listing that cannot run is refused with the reasons, not published.
 */
function checkBundle(bundle: unknown): { json: string; engineChecked: 0 | 1 } | { error: string } {
  const json = typeof bundle === 'string' ? bundle : JSON.stringify(bundle ?? null);
  if (json.length > MAX_BUNDLE_BYTES) return { error: 'Bundle is too large.' };
  let node: unknown;
  try {
    node = typeof bundle === 'string' ? JSON.parse(bundle) : bundle;
  } catch {
    return { error: 'The bundle is not valid JSON.' };
  }
  const parsed = ProcessNodeSchema.safeParse(node);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `The bundle is not a unit ProcessForge can place: ${issue?.path.join('.') || 'node'}: ${issue?.message ?? 'invalid'}.` };
  }
  const contract = (parsed.data.config as { contract?: unknown }).contract;
  if (contract === undefined) return { json, engineChecked: 0 };
  const verdict = executeValidateUnitOp({ contract });
  if (verdict.verdict !== 'ACCEPTED') {
    const reasons = Object.values(verdict.gates).flatMap((g) => g.errors);
    return { error: `Its design does not pass the engine's checks, so it was not published: ${reasons.slice(0, 5).join('; ')}` };
  }
  return { json, engineChecked: 1 };
}

/** The next version: the one asked for if it is higher, else the next minor. Null if the one asked for is not higher. */
function nextVersion(current: string, wanted?: string): string | null {
  const parse = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const now = parse(current) ?? [1, 0, 0];
  if (wanted !== undefined) {
    const w = parse(wanted);
    if (!w) return null;
    for (let i = 0; i < 3; i++) {
      if (w[i]! > now[i]!) return w.join('.');
      if (w[i]! < now[i]!) return null;
    }
    return null;
  }
  return `${now[0]}.${now[1]! + 1}.0`;
}

/** A listing anyone may see: published, or unpublished but the caller's own. */
async function visibleListing(request: Request, env: Env, id: string): Promise<UnitOpRecord | null> {
  const record = await env.DB.prepare('SELECT * FROM unitops WHERE id = ?').bind(id).first<UnitOpRecord>();
  if (!record) return null;
  if ((record.status ?? 'published') === 'published') return record;
  try {
    const s = await requireSession(request, env);
    return s.uid === record.author_id ? record : null;
  } catch {
    return null;
  }
}

async function ownListing(env: Env, id: string, uid: string): Promise<UnitOpRecord | null> {
  return env.DB.prepare('SELECT * FROM unitops WHERE id = ? AND author_id = ?').bind(id, uid).first<UnitOpRecord>();
}

/** A flowsheet bundle larger than this is almost certainly not a flowsheet. */
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;

// Bearer tokens, not cookies, so a wildcard origin does not expose sessions to
// cross-site requests: a page on another origin has no token to send.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400'
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ success: false, error: message }, status);
}

function clientIds(env: Env): string[] {
  const ids = (env.GOOGLE_CLIENT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (env.GOOGLE_DESKTOP_CLIENT_ID) ids.push(env.GOOGLE_DESKTOP_CLIENT_ID);
  return ids;
}

async function requireSession(request: Request, env: Env): Promise<Session> {
  const token = bearerToken(request);
  if (!token) throw new AuthError('Not signed in.');
  return verifySession(token, env.SESSION_SECRET);
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AuthError('Request body is not valid JSON.', 400);
  }
}

/** Creates the user row on first sign-in, refreshes the profile after that. */
async function upsertUser(env: Env, s: Session, picture: string | null): Promise<void> {
  // users.email is UNIQUE. A profile written by the old, unverified session
  // endpoint (usr_google_<sub>), or an older account Google has since given
  // this address to, would make the insert below fail -- the first desktop
  // sign-in returned 500 for exactly this reason. Google has just proven this
  // account holds the address, so free it from any other row. Those rows keep
  // their ids, and anything that references them, unchanged.
  await env.DB.prepare(
    `UPDATE users SET email = email || '#superseded-by:' || ?, updated_at = CURRENT_TIMESTAMP
     WHERE email = ? AND id <> ?`
  )
    .bind(s.uid, s.email, s.uid)
    .run();

  await env.DB.prepare(
    `INSERT INTO users (id, username, display_name, email, avatar_url, provider, organization)
     VALUES (?, ?, ?, ?, ?, 'google', NULL)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       email = excluded.email,
       avatar_url = coalesce(excluded.avatar_url, users.avatar_url),
       updated_at = CURRENT_TIMESTAMP`
  )
    // username is the uid: the old code used the email's local part, which
    // collides for john@a.com and john@b.com under a UNIQUE constraint.
    .bind(s.uid, s.uid, s.name, s.email, picture)
    .run();
}

async function issueSession(env: Env, idToken: string, jwks: JwksFetcher): Promise<Response> {
  const claims = await verifyGoogleIdToken(idToken, { clientIds: clientIds(env), jwks });
  const session = sessionFromClaims(claims);
  await upsertUser(env, session, claims.picture ?? null);
  return jsonResponse({
    success: true,
    session: {
      token: await signSession(session, env.SESSION_SECRET),
      expiresAt: new Date(session.exp * 1000).toISOString(),
      user: { id: session.uid, email: session.email, name: session.name, avatarUrl: claims.picture ?? null }
    }
  });
}

export function createHandler(deps: { jwks?: JwksFetcher } = {}) {
  const jwks = deps.jwks ?? fetchGoogleJwks;

  return async function handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

    try {
      // ── GET /api/health ─────────────────────────────────────────────────
      if (path === '/api/health' && method === 'GET') {
        return jsonResponse({
          status: 'healthy',
          service: 'ProcessForge Community UnitOp Library API',
          version: '1.1.0',
          environment: env.ENVIRONMENT || 'production',
          timestamp: new Date().toISOString()
        });
      }

      // ── POST /api/auth/google — web sign-in: a GIS ID token ─────────────
      if (path === '/api/auth/google' && method === 'POST') {
        const body = await readJson<{ credential?: string }>(request);
        if (!body.credential) return errorResponse('Missing credential.');
        return await issueSession(env, body.credential, jwks);
      }

      // ── POST /api/auth/google/code — desktop sign-in: loopback code ─────
      if (path === '/api/auth/google/code' && method === 'POST') {
        if (!env.GOOGLE_DESKTOP_CLIENT_ID || !env.GOOGLE_DESKTOP_CLIENT_SECRET) {
          return errorResponse('Desktop Google sign-in is not configured on this server.', 501);
        }
        const body = await readJson<{ code?: string; codeVerifier?: string; redirectUri?: string }>(request);
        if (!body.code || !body.codeVerifier || !body.redirectUri) {
          return errorResponse('Missing code, codeVerifier or redirectUri.');
        }
        const idToken = await exchangeGoogleCode({
          code: body.code,
          codeVerifier: body.codeVerifier,
          redirectUri: body.redirectUri,
          clientId: env.GOOGLE_DESKTOP_CLIENT_ID,
          clientSecret: env.GOOGLE_DESKTOP_CLIENT_SECRET
        });
        return await issueSession(env, idToken, jwks);
      }

      // ── GET /api/auth/me ────────────────────────────────────────────────
      if (path === '/api/auth/me' && method === 'GET') {
        const s = await requireSession(request, env);
        return jsonResponse({ success: true, user: { id: s.uid, email: s.email, name: s.name } });
      }

      // ── POST /api/auth/session — removed ────────────────────────────────
      // It upserted any profile it was sent, with no proof of identity.
      if (path === '/api/auth/session') {
        return errorResponse('This endpoint was removed. Sign in with POST /api/auth/google.', 410);
      }

      // ── GET /api/unitops — public search, published listings only ───────
      if (path === '/api/unitops' && method === 'GET') {
        const query = url.searchParams.get('q') || '';
        const category = url.searchParams.get('category') || 'ALL';
        const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 100);

        let sql = `SELECT ${LISTING_COLUMNS} FROM unitops WHERE status = 'published'`;
        const params: unknown[] = [];
        if (category && category !== 'ALL') {
          sql += ' AND category = ?';
          params.push(category);
        }
        if (query) {
          sql += ' AND (name LIKE ? OR description LIKE ? OR author_name LIKE ? OR tags LIKE ?)';
          const pattern = `%${query}%`;
          params.push(pattern, pattern, pattern, pattern);
        }
        sql += ' ORDER BY download_count DESC, updated_at DESC LIMIT ?';
        params.push(limit);

        const results = await env.DB.prepare(sql).bind(...params).all<Omit<UnitOpRecord, 'bundle_json'>>();
        return jsonResponse({ success: true, count: results.results?.length || 0, unitops: results.results || [] });
      }

      // ── GET /api/unitops/mine — the signed-in author's listings ─────────
      if (path === '/api/unitops/mine' && method === 'GET') {
        const s = await requireSession(request, env);
        const results = await env.DB.prepare(`SELECT ${LISTING_COLUMNS} FROM unitops WHERE author_id = ? ORDER BY updated_at DESC`)
          .bind(s.uid)
          .all<Omit<UnitOpRecord, 'bundle_json'>>();
        return jsonResponse({ success: true, count: results.results?.length || 0, unitops: results.results || [] });
      }

      // ── POST /api/unitops/publish — signed-in ───────────────────────────
      if (path === '/api/unitops/publish' && method === 'POST') {
        const s = await requireSession(request, env);
        const body = await readJson<PublishBody>(request);
        const bad = checkListing(body, true);
        if (bad) return errorResponse(bad);
        const checked = checkBundle(body.bundle);
        if ('error' in checked) return errorResponse(checked.error, 422);

        // The id is always server-generated, and the author is always the
        // session: a client-chosen author_id let anyone publish as anyone.
        const id = `plugin-${crypto.randomUUID()}`;
        const version = '1.0.0';
        await env.DB.prepare(
          `INSERT INTO unitops (id, name, author_id, author_name, category, description, version, rating, download_count, asme_rating, tags, bundle_json, status, engine_checked, release_notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?, 'published', ?, ?)`
        )
          .bind(id, body.name, s.uid, s.name, body.category, body.description, version, tagsOf(body.tags), checked.json, checked.engineChecked, body.releaseNotes ?? null)
          .run();
        await env.DB.prepare('INSERT INTO unitop_versions (unitop_id, version, bundle_json, release_notes) VALUES (?, ?, ?, ?)')
          .bind(id, version, checked.json, body.releaseNotes ?? null)
          .run();

        return jsonResponse(
          { success: true, message: `Published "${body.name}".`, pluginId: id, version, engineChecked: checked.engineChecked === 1 },
          201
        );
      }

      const versionsMatch = path.match(/^\/api\/unitops\/([^/]+)\/versions$/);
      const unitOpMatch = path.match(/^\/api\/unitops\/([^/]+)$/);

      // ── GET /api/unitops/:id/versions — public for published listings ───
      if (versionsMatch && method === 'GET') {
        const id = decodeURIComponent(versionsMatch[1]!);
        const record = await visibleListing(request, env, id);
        if (!record) return errorResponse(`UnitOp plugin "${id}" not found.`, 404);
        const results = await env.DB.prepare(
          'SELECT version, release_notes, created_at FROM unitop_versions WHERE unitop_id = ? ORDER BY created_at DESC, rowid DESC'
        )
          .bind(id)
          .all<{ version: string; release_notes: string | null; created_at: string }>();
        return jsonResponse({ success: true, versions: results.results || [] });
      }

      // ── GET /api/unitops/:id — public pull (optionally ?version=) ───────
      if (unitOpMatch && method === 'GET') {
        const id = decodeURIComponent(unitOpMatch[1]!);
        const record = await visibleListing(request, env, id);
        if (!record) return errorResponse(`UnitOp plugin "${id}" not found.`, 404);

        let bundleJson = record.bundle_json;
        const wanted = url.searchParams.get('version');
        if (wanted && wanted !== record.version) {
          const old = await env.DB.prepare('SELECT bundle_json FROM unitop_versions WHERE unitop_id = ? AND version = ?')
            .bind(id, wanted)
            .first<{ bundle_json: string }>();
          if (!old) return errorResponse(`"${record.name}" has no version ${wanted}.`, 404);
          bundleJson = old.bundle_json;
        }
        await env.DB.prepare('UPDATE unitops SET download_count = download_count + 1 WHERE id = ?').bind(id).run();

        let bundle: unknown = {};
        try {
          bundle = JSON.parse(bundleJson);
        } catch {
          bundle = { raw: bundleJson };
        }
        const { bundle_json: _omit, ...listing } = record;
        return jsonResponse({ success: true, unitop: { ...listing, ...(wanted ? { version: wanted } : {}), bundle } });
      }

      // ── PUT /api/unitops/:id — the author publishes a new version ───────
      if (unitOpMatch && method === 'PUT') {
        const s = await requireSession(request, env);
        const id = decodeURIComponent(unitOpMatch[1]!);
        const record = await ownListing(env, id, s.uid);
        if (!record) return errorResponse(`You have no listing "${id}".`, 404);
        const body = await readJson<PublishBody>(request);
        const bad = checkListing(body, false);
        if (bad) return errorResponse(bad);

        let json = record.bundle_json;
        let engineChecked = record.engine_checked ?? 0;
        let version = record.version;
        if (body.bundle !== undefined) {
          const checked = checkBundle(body.bundle);
          if ('error' in checked) return errorResponse(checked.error, 422);
          json = checked.json;
          engineChecked = checked.engineChecked;
          const next = nextVersion(record.version, body.version);
          if (!next) return errorResponse(`version must be greater than ${record.version} (e.g. ${nextVersion(record.version)}).`);
          version = next;
        }
        await env.DB.prepare(
          `UPDATE unitops SET name = ?, category = ?, description = ?, tags = ?, bundle_json = ?, version = ?, engine_checked = ?,
             release_notes = ?, status = 'published', updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND author_id = ?`
        )
          .bind(
            body.name ?? record.name,
            body.category ?? record.category,
            body.description ?? record.description,
            body.tags !== undefined ? tagsOf(body.tags) : record.tags ?? '',
            json,
            version,
            engineChecked,
            body.releaseNotes ?? record.release_notes ?? null,
            id,
            s.uid
          )
          .run();
        if (version !== record.version) {
          await env.DB.prepare('INSERT INTO unitop_versions (unitop_id, version, bundle_json, release_notes) VALUES (?, ?, ?, ?)')
            .bind(id, version, json, body.releaseNotes ?? null)
            .run();
        }
        return jsonResponse({
          success: true,
          message: version !== record.version ? `Published version ${version} of "${body.name ?? record.name}".` : `Updated "${body.name ?? record.name}".`,
          pluginId: id,
          version,
          engineChecked: engineChecked === 1
        });
      }

      // ── DELETE /api/unitops/:id — the author unpublishes ────────────────
      if (unitOpMatch && method === 'DELETE') {
        const s = await requireSession(request, env);
        const id = decodeURIComponent(unitOpMatch[1]!);
        const record = await ownListing(env, id, s.uid);
        if (!record) return errorResponse(`You have no listing "${id}".`, 404);
        await env.DB.prepare(`UPDATE unitops SET status = 'unpublished', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND author_id = ?`)
          .bind(id, s.uid)
          .run();
        return jsonResponse({
          success: true,
          message: `Unpublished "${record.name}". Flowsheets that already use it keep their copy; publish it again with an update.`
        });
      }

      // ── Cloud projects — every route is owner-scoped ────────────────────
      const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);

      if (path === '/api/projects' && method === 'GET') {
        const s = await requireSession(request, env);
        const res = await env.DB.prepare(
          `SELECT id, name, description, user_id as userId, author_name as authorName, node_count as nodeCount,
                  stream_count as streamCount, created_at as createdAt, updated_at as updatedAt
           FROM simulation_projects WHERE user_id = ? ORDER BY updated_at DESC`
        )
          .bind(s.uid)
          .all();
        const projects = res.results || [];
        return jsonResponse({ success: true, count: projects.length, projects });
      }

      if (projectMatch && method === 'GET') {
        const s = await requireSession(request, env);
        const id = decodeURIComponent(projectMatch[1]!);
        const project = await env.DB.prepare(
          `SELECT id, name, description, user_id as userId, author_name as authorName, node_count as nodeCount,
                  stream_count as streamCount, created_at as createdAt, updated_at as updatedAt, bundle_json as bundle
           FROM simulation_projects WHERE id = ? AND user_id = ?`
        )
          .bind(id, s.uid)
          .first();
        // Someone else's project and a missing one are indistinguishable, so
        // the response does not confirm that an id exists.
        if (!project) return errorResponse(`Project "${id}" not found.`, 404);
        return jsonResponse({ success: true, project });
      }

      if (path === '/api/projects' && method === 'POST') {
        const s = await requireSession(request, env);
        const body = await readJson<{
          id?: string;
          name?: string;
          description?: string;
          nodeCount?: number;
          streamCount?: number;
          bundle?: unknown;
        }>(request);
        if (!body.id || !body.name || body.bundle === undefined) {
          return errorResponse('Missing required fields: id, name and bundle are required.');
        }
        const bundleStr = typeof body.bundle === 'string' ? body.bundle : JSON.stringify(body.bundle);
        if (bundleStr.length > MAX_BUNDLE_BYTES) return errorResponse('Project is too large.', 413);

        const now = new Date().toISOString();
        // The WHERE on the upsert is the ownership check: a conflicting row
        // owned by someone else is left untouched and reports zero changes.
        const result = await env.DB.prepare(
          `INSERT INTO simulation_projects (id, name, description, user_id, author_name, node_count, stream_count, bundle_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             author_name = excluded.author_name,
             node_count = excluded.node_count,
             stream_count = excluded.stream_count,
             bundle_json = excluded.bundle_json,
             updated_at = excluded.updated_at
           WHERE simulation_projects.user_id = excluded.user_id`
        )
          .bind(
            body.id,
            body.name,
            body.description || '',
            s.uid,
            s.name,
            Number(body.nodeCount) || 0,
            Number(body.streamCount) || 0,
            bundleStr,
            now,
            now
          )
          .run();

        if ((result.meta?.changes ?? 1) === 0) {
          return errorResponse('A project with this id belongs to another account.', 409);
        }
        return jsonResponse({ success: true, message: `Saved "${body.name}".`, projectId: body.id });
      }

      if (projectMatch && method === 'DELETE') {
        const s = await requireSession(request, env);
        const id = decodeURIComponent(projectMatch[1]!);
        const result = await env.DB.prepare('DELETE FROM simulation_projects WHERE id = ? AND user_id = ?')
          .bind(id, s.uid)
          .run();
        if ((result.meta?.changes ?? 1) === 0) return errorResponse(`Project "${id}" not found.`, 404);
        return jsonResponse({ success: true, message: `Deleted "${id}".` });
      }

      return errorResponse(`Endpoint not found: ${method} ${path}`, 404);
    } catch (err: unknown) {
      if (err instanceof AuthError) return errorResponse(err.message, err.status);
      // Do not echo internal error text (SQL, stack details) to the client.
      console.error('Unhandled API error', err);
      return errorResponse('Internal server error.', 500);
    }
  };
}

const handler = createHandler();

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handler(request, env);
  }
};
