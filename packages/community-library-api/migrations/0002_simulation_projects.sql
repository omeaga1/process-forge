-- Cloud projects.
--
-- This table existed in production before it existed here: it was created by
-- hand, so a fresh environment (or a test database) had no table and every
-- project query failed. The worker swallowed those failures and reported the
-- save as successful. Matches the production schema exactly, and is a no-op
-- where the table already exists.
CREATE TABLE IF NOT EXISTS simulation_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  user_id TEXT NOT NULL,
  author_name TEXT,
  node_count INTEGER DEFAULT 0,
  stream_count INTEGER DEFAULT 0,
  bundle_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_simulation_projects_user ON simulation_projects(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
