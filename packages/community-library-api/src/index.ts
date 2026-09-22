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

      // ── GET /api/unitops — public search ────────────────────────────────
      if (path === '/api/unitops' && method === 'GET') {
        const query = url.searchParams.get('q') || '';
        const category = url.searchParams.get('category') || 'ALL';
        const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 100);

        let sql =
          'SELECT id, name, author_id, author_name, category, description, version, rating, download_count, asme_rating, tags, created_at FROM unitops WHERE 1=1';
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
        sql += ' ORDER BY download_count DESC, rating DESC LIMIT ?';
        params.push(limit);

        const results = await env.DB.prepare(sql).bind(...params).all<Omit<UnitOpRecord, 'bundle_json'>>();
        return jsonResponse({ success: true, count: results.results?.length || 0, unitops: results.results || [] });
      }

      // ── GET /api/unitops/:id — public pull ──────────────────────────────
      const unitOpMatch = path.match(/^\/api\/unitops\/([^/]+)$/);
      if (unitOpMatch && method === 'GET') {
        const id = decodeURIComponent(unitOpMatch[1]!);
        const record = await env.DB.prepare('SELECT * FROM unitops WHERE id = ?').bind(id).first<UnitOpRecord>();
        if (!record) return errorResponse(`UnitOp plugin "${id}" not found.`, 404);

        await env.DB.prepare('UPDATE unitops SET download_count = download_count + 1 WHERE id = ?').bind(id).run();

        let bundle: unknown = {};
        try {
          bundle = JSON.parse(record.bundle_json);
        } catch {
          bundle = { raw: record.bundle_json };
        }
        return jsonResponse({ success: true, unitop: { ...record, bundle } });
      }

      // ── POST /api/unitops/publish — signed-in ───────────────────────────
      if (path === '/api/unitops/publish' && method === 'POST') {
        const s = await requireSession(request, env);
        const body = await readJson<Partial<UnitOpRecord> & { bundle?: unknown }>(request);

        if (!body.name || !body.category || !body.description) {
          return errorResponse('Missing required fields: name, category, and description are required.');
        }
        const validCategories = ['PACKAGING', 'FLUID_PROCESSING', 'MATERIAL_HANDLING', 'QUALITY'];
        if (!validCategories.includes(body.category)) {
          return errorResponse(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
        }
        const bundleJson =
          typeof body.bundle === 'string' ? body.bundle : JSON.stringify(body.bundle ?? body.bundle_json ?? {});
        if (bundleJson.length > MAX_BUNDLE_BYTES) return errorResponse('Bundle is too large.', 413);

        // The id is always server-generated, and the author is always the
        // session: a client-chosen author_id let anyone publish as anyone.
        const id = `plugin-${crypto.randomUUID()}`;
        await env.DB.prepare(
          `INSERT INTO unitops (id, name, author_id, author_name, category, description, version, rating, download_count, asme_rating, tags, bundle_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`
        )
          .bind(
            id,
            body.name,
            s.uid,
            s.name,
            body.category,
            body.description,
            body.version || '1.0.0',
            body.asme_rating || null,
            body.tags || '',
            bundleJson
          )
          .run();

        return jsonResponse({ success: true, message: `Published "${body.name}".`, pluginId: id }, 201);
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
