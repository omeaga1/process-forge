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
          email?: string;
          name?: string;
          provider?: string;
          organization?: string;
        };

        const email = body.email || 'engineer@community.process-forge.org';
        const name = body.name || 'Community Process Engineer';
        const provider = body.provider || 'github';
        const organization = body.organization || 'Open-Source Engineering';
        const userId = `user-${Math.random().toString(36).substring(2, 9)}`;

        // Upsert user
        await env.DB.prepare(`
          INSERT INTO users (id, username, display_name, email, provider, organization)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            display_name = excluded.display_name,
            organization = excluded.organization,
            updated_at = CURRENT_TIMESTAMP
        `).bind(userId, email.split('@')[0], name, email, provider, organization).run();

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

      return errorResponse(`Endpoint not found: ${method} ${path}`, 404);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return errorResponse(`Internal Server Error: ${errorMsg}`, 500);
    }
  }
};
