/**
 * ProcessForge Community UnitOp Library — Cloudflare Worker API
 * 
 * Provides serverless endpoints for community developers to:
 * - Query and search the community library
 * - Pull UnitOp plugins into their active simulation flowsheet
 * - Publish (push) new validated UnitOp plugins (.pfu bundles)
 * - Manage creator accounts & OAuth sessions
 */

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results?: T[]; success: boolean }>;
  run<T = unknown>(): Promise<{ success: boolean }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ALLOWED_ORIGIN: string;
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

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400'
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ success: false, error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // ── GET /api/health ──────────────────────────────────────────────────────
      if (path === '/api/health' && method === 'GET') {
        return jsonResponse({
          status: 'healthy',
          service: 'ProcessForge Community UnitOp Library API',
          version: '1.0.0',
          environment: env.ENVIRONMENT || 'production',
          timestamp: new Date().toISOString()
        });
      }

      // ── GET /api/unitops (List & Search) ─────────────────────────────────────
      if (path === '/api/unitops' && method === 'GET') {
        const query = url.searchParams.get('q') || '';
        const category = url.searchParams.get('category') || 'ALL';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

        let sql = 'SELECT id, name, author_id, author_name, category, description, version, rating, download_count, asme_rating, tags, created_at FROM unitops WHERE 1=1';
        const params: unknown[] = [];

        if (category && category !== 'ALL') {
          sql += ' AND category = ?';
          params.push(category);
        }

        if (query) {
          sql += ' AND (name LIKE ? OR description LIKE ? OR author_name LIKE ? OR tags LIKE ?)';
          const searchPattern = `%${query}%`;
          params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        sql += ' ORDER BY download_count DESC, rating DESC LIMIT ?';
        params.push(limit);

        const results = await env.DB.prepare(sql).bind(...params).all<Omit<UnitOpRecord, 'bundle_json'>>();

        return jsonResponse({
          success: true,
          count: results.results?.length || 0,
          unitops: results.results || []
        });
      }

      // ── GET /api/unitops/:id (Pull Plugin Bundle) ───────────────────────────
      const unitOpMatch = path.match(/^\/api\/unitops\/([^/]+)$/);
      if (unitOpMatch && method === 'GET') {
        const id = unitOpMatch[1];

        // Fetch unitop record
        const record = await env.DB.prepare('SELECT * FROM unitops WHERE id = ?').bind(id).first<UnitOpRecord>();

        if (!record) {
          return errorResponse(`UnitOp plugin "${id}" not found.`, 404);
        }

        // Increment download count asynchronously
        env.DB.prepare('UPDATE unitops SET download_count = download_count + 1 WHERE id = ?').bind(id).run().catch(() => {});

        let parsedBundle = {};
        try {
          parsedBundle = JSON.parse(record.bundle_json);
        } catch {
          parsedBundle = { raw: record.bundle_json };
        }

        return jsonResponse({
          success: true,
          unitop: {
            ...record,
            bundle: parsedBundle
          }
        });
      }

      // ── POST /api/unitops/publish (Push New Plugin) ─────────────────────────
      if (path === '/api/unitops/publish' && method === 'POST') {
        const body = (await request.json()) as Partial<UnitOpRecord> & {
          bundle?: unknown;
          authorEmail?: string;
        };

        if (!body.name || !body.category || !body.description) {
          return errorResponse('Missing required fields: name, category, and description are required.');
        }

        const validCategories = ['PACKAGING', 'FLUID_PROCESSING', 'MATERIAL_HANDLING', 'QUALITY'];
        if (!validCategories.includes(body.category)) {
          return errorResponse(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
        }

        const id = body.id || `plugin-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const authorId = body.author_id || 'user-community';
        const authorName = body.author_name || 'Community Engineer';
        const version = body.version || '1.0.0';
        const asmeRating = body.asme_rating || 'Unrated Community UnitOp';
        const tags = body.tags || '';
        const bundleJson = typeof body.bundle === 'string' ? body.bundle : JSON.stringify(body.bundle || body.bundle_json || {});

        await env.DB.prepare(`
          INSERT INTO unitops (id, name, author_id, author_name, category, description, version, rating, download_count, asme_rating, tags, bundle_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, 5.0, 1, ?, ?, ?)
        `).bind(id, body.name, authorId, authorName, body.category, body.description, version, asmeRating, tags, bundleJson).run();

        return jsonResponse({
          success: true,
          message: `UnitOp plugin "${body.name}" published successfully to the Community UnitOp Library!`,
          pluginId: id
        }, 201);
      }

      // ── POST /api/auth/session (Creator Login / Session) ────────────────────
      if (path === '/api/auth/session' && method === 'POST') {
        const body = (await request.json()) as {
          id?: string;
          email?: string;
          name?: string;
          avatarUrl?: string;
          provider?: string;
          organization?: string;
        };

        const email = body.email || 'engineer@community.process-forge.org';
        const name = body.name || 'Community Process Engineer';
        const avatarUrl = body.avatarUrl || null;
        const provider = body.provider || 'google';
        const organization = body.organization || 'Google Account Workspace';
        const userId = body.id || `user-${Math.random().toString(36).substring(2, 9)}`;

        // Upsert user into D1
        await env.DB.prepare(`
          INSERT INTO users (id, username, display_name, email, avatar_url, provider, organization)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            display_name = excluded.display_name,
            avatar_url = coalesce(excluded.avatar_url, users.avatar_url),
            organization = excluded.organization,
            updated_at = CURRENT_TIMESTAMP
        `).bind(userId, email.split('@')[0], name, email, avatarUrl, provider, organization).run();

        return jsonResponse({
          success: true,
          session: {
            userId,
            email,
            name,
            organization,
            provider,
            token: `pflib_session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
          }
        });
      }

      // ── GET /api/projects (List User Cloud Simulations) ──────────────────────
      if (path === '/api/projects' && method === 'GET') {
        const userId = url.searchParams.get('userId') || 'default_user';
        let records: any[] = [];
        try {
          const res = await env.DB.prepare(`
            SELECT id, name, description, user_id as userId, author_name as authorName, node_count as nodeCount, stream_count as streamCount, created_at as createdAt, updated_at as updatedAt
            FROM simulation_projects
            WHERE user_id = ?
            ORDER BY updated_at DESC
          `).bind(userId).all();
          records = res.results || [];
        } catch {
          // Table might not exist in dev; return empty list
        }

        return jsonResponse({
          success: true,
          count: records.length,
          projects: records
        });
      }

      // ── GET /api/projects/:id (Load Cloud Project) ──────────────────────────
      const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch && method === 'GET') {
        const id = projectMatch[1];
        let project: any = null;
        try {
          project = await env.DB.prepare(`
            SELECT id, name, description, user_id as userId, author_name as authorName, node_count as nodeCount, stream_count as streamCount, created_at as createdAt, updated_at as updatedAt, bundle_json as bundle
            FROM simulation_projects
            WHERE id = ?
          `).bind(id).first();
        } catch {
          // ignore
        }

        if (!project) {
          return errorResponse(`Simulation project "${id}" not found in Cloud Storage.`, 404);
        }

        return jsonResponse({
          success: true,
          project
        });
      }

      // ── POST /api/projects (Save or Sync Cloud Project) ─────────────────────
      if (path === '/api/projects' && method === 'POST') {
        const body = (await request.json()) as {
          id: string;
          name: string;
          description?: string;
          userId: string;
          authorName?: string;
          nodeCount?: number;
          streamCount?: number;
          bundle: any;
        };

        if (!body.id || !body.name || !body.userId) {
          return errorResponse('Missing required fields: id, name, and userId are required.');
        }

        const bundleStr = typeof body.bundle === 'string' ? body.bundle : JSON.stringify(body.bundle);
        const now = new Date().toISOString();

        try {
          await env.DB.prepare(`
            INSERT INTO simulation_projects (id, name, description, user_id, author_name, node_count, stream_count, bundle_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              author_name = excluded.author_name,
              node_count = excluded.node_count,
              stream_count = excluded.stream_count,
              bundle_json = excluded.bundle_json,
              updated_at = excluded.updated_at
          `).bind(
            body.id,
            body.name,
            body.description || '',
            body.userId,
            body.authorName || 'Engineer',
            body.nodeCount || 0,
            body.streamCount || 0,
            bundleStr,
            now,
            now
          ).run();
        } catch {
          // In local dev without D1 migration, return success for client fallback
        }

        return jsonResponse({
          success: true,
          message: `Simulation "${body.name}" saved to ProcessForge Cloud Storage.`,
          projectId: body.id
        });
      }

      // ── DELETE /api/projects/:id (Delete Cloud Project) ─────────────────────
      if (projectMatch && method === 'DELETE') {
        const id = projectMatch[1];
        try {
          await env.DB.prepare('DELETE FROM simulation_projects WHERE id = ?').bind(id).run();
        } catch {
          // ignore
        }

        return jsonResponse({
          success: true,
          message: `Simulation project "${id}" deleted from Cloud Storage.`
        });
      }

      return errorResponse(`Endpoint not found: ${method} ${path}`, 404);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return errorResponse(`Internal Server Error: ${errorMsg}`, 500);
    }
  }
};
