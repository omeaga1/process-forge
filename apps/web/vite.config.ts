import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function processForgeCloudPlugin(): Plugin {
  const dataDir = path.resolve(__dirname, '.processforge_cloud');
  const projectsDir = path.resolve(dataDir, 'projects');
  const usersFile = path.resolve(dataDir, 'users.json');

  // Ensure persistent storage directories exist on disk
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
  }
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([], null, 2));
  }

  function hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
  }

  function readUsers(): any[] {
    try {
      return JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
    } catch {
      return [];
    }
  }

  function writeUsers(users: any[]) {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  }

  return {
    name: 'processforge-cloud-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        const url = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
        const pathname = url.pathname;
        const method = req.method;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (method === 'OPTIONS') {
          res.statusCode = 204;
          return res.end();
        }

        // Helper to read JSON request body
        const readBody = (): Promise<any> => {
          return new Promise((resolve) => {
            let data = '';
            req.on('data', (chunk) => (data += chunk));
            req.on('end', () => {
              try {
                resolve(data ? JSON.parse(data) : {});
              } catch {
                resolve({});
              }
            });
          });
        };

        // 1. GET /api/health
        if (pathname === '/api/health' && method === 'GET') {
          res.statusCode = 200;
          return res.end(JSON.stringify({
            status: 'healthy',
            service: 'ProcessForge Cloud Storage & Auth API',
            storage: 'disk',
            dataDir,
            projectsCount: fs.readdirSync(projectsDir).filter((f) => f.endsWith('.json')).length
          }));
        }

        // 2. POST /api/auth/register
        if (pathname === '/api/auth/register' && method === 'POST') {
          const body = await readBody();
          const { email, password, name, organization } = body;
          if (!email || !password) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ success: false, error: 'Email and password are required.' }));
          }
          if (password.length < 8) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ success: false, error: 'Password must be at least 8 characters long.' }));
          }

          const users = readUsers();
          const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
          if (existing) {
            res.statusCode = 409;
            return res.end(JSON.stringify({ success: false, error: 'An account with this email already exists. Please sign in.' }));
          }

          const salt = crypto.randomBytes(16).toString('hex');
          const passwordHash = hashPassword(password, salt);
          const userId = `usr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
          const token = `pf_token_${crypto.randomBytes(24).toString('hex')}`;

          const newUser = {
            id: userId,
            email: email.toLowerCase(),
            name: name || email.split('@')[0],
            organization: organization || 'Process Engineering Team',
            provider: 'email',
            salt,
            passwordHash,
            plan: 'Professional',
            cloudStorageQuota: { usedProjects: 0, maxProjects: 50 },
            createdAt: new Date().toISOString()
          };

          users.push(newUser);
          writeUsers(users);

          const { passwordHash: _, salt: __, ...safeUser } = newUser;
          res.statusCode = 201;
          return res.end(JSON.stringify({ success: true, user: { ...safeUser, token } }));
        }

        // 3. POST /api/auth/login
        if (pathname === '/api/auth/login' && method === 'POST') {
          const body = await readBody();
          const { email, password } = body;
          if (!email || !password) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ success: false, error: 'Email and password are required.' }));
          }

          const users = readUsers();
          const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
          if (!user) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ success: false, error: 'No account found with this email. Please register first.' }));
          }

          const computedHash = hashPassword(password, user.salt);
          if (computedHash !== user.passwordHash) {
            res.statusCode = 401;
            return res.end(JSON.stringify({ success: false, error: 'Incorrect password. Please verify your credentials.' }));
          }

          const token = `pf_token_${crypto.randomBytes(24).toString('hex')}`;
          const { passwordHash: _, salt: __, ...safeUser } = user;
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, user: { ...safeUser, token } }));
        }

        // 4. GET /api/projects
        if (pathname === '/api/projects' && method === 'GET') {
          const userId = url.searchParams.get('userId');
          const files = fs.readdirSync(projectsDir).filter((f) => f.endsWith('.json'));
          const projects: any[] = [];

          for (const file of files) {
            try {
              const content = JSON.parse(fs.readFileSync(path.resolve(projectsDir, file), 'utf-8'));
              if (!userId || content.userId === userId || content.userId === 'guest_cloud_user') {
                projects.push(content);
              }
            } catch {}
          }

          projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, count: projects.length, projects }));
        }

        // 5. POST /api/projects
        if (pathname === '/api/projects' && method === 'POST') {
          const body = await readBody();
          if (!body.id || !body.name) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ success: false, error: 'Missing required fields: id and name.' }));
          }

          const filePath = path.resolve(projectsDir, `${body.id}.json`);
          const now = new Date().toISOString();
          const record = {
            ...body,
            createdAt: body.createdAt || now,
            updatedAt: now
          };

          fs.writeFileSync(filePath, JSON.stringify(record, null, 2));

          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            message: `Simulation "${body.name}" saved to ProcessForge Cloud Storage on disk.`,
            projectId: body.id
          }));
        }

        // 6. GET /api/projects/:id
        const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
        if (projectMatch && method === 'GET') {
          const id = projectMatch[1];
          const filePath = path.resolve(projectsDir, `${id}.json`);
          if (fs.existsSync(filePath)) {
            const project = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, project }));
          }
          res.statusCode = 404;
          return res.end(JSON.stringify({ success: false, error: 'Project not found' }));
        }

        // 7. DELETE /api/projects/:id
        if (projectMatch && method === 'DELETE') {
          const id = projectMatch[1];
          const filePath = path.resolve(projectsDir, `${id}.json`);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, message: `Deleted project ${id}` }));
          }
          res.statusCode = 404;
          return res.end(JSON.stringify({ success: false, error: 'Project not found' }));
        }

        return next();
      });
    }
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  plugins: [react(), processForgeCloudPlugin()],
  resolve: {
    alias: {
      '@process-forge/canvas-ui': path.resolve(__dirname, '../../packages/canvas-ui/src'),
      '@process-forge/theme': path.resolve(__dirname, '../../packages/theme/src'),
      '@process-forge/protocol': path.resolve(__dirname, '../../packages/protocol/src'),
      '@process-forge/simulation-core': path.resolve(__dirname, '../../packages/simulation-core/src'),
      '@process-forge/scaffold-registry': path.resolve(__dirname, '../../packages/scaffold-registry/src'),
    }
  },
  server: {
    port: 3000,
    open: false
  },
  build: {
    target: 'esnext',
    outDir: 'dist'
  }
});