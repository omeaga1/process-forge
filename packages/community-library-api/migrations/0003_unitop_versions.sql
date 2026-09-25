-- Published unit ops can be updated (a new version), unpublished, and
-- listed by their author. Every version is kept.

ALTER TABLE unitops ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'unpublished'));
-- 1 when the listing is a designed unit whose contract passed the engine's
-- checks (validate_unit_op) when it was published. It is not a review.
ALTER TABLE unitops ADD COLUMN engine_checked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE unitops ADD COLUMN release_notes TEXT;

CREATE TABLE IF NOT EXISTS unitop_versions (
  unitop_id TEXT NOT NULL,
  version TEXT NOT NULL,
  bundle_json TEXT NOT NULL,
  release_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (unitop_id, version),
  FOREIGN KEY (unitop_id) REFERENCES unitops(id)
);

CREATE INDEX IF NOT EXISTS idx_unitops_status ON unitops(status);

-- The three listings 0001 seeded were placeholders written as if real
-- companies had published them, with invented ratings, download counts and
-- code-compliance claims. They are removed, with their made-up authors.
DELETE FROM unitops WHERE id IN ('plugin-serac-10-filler', 'plugin-high-shear-mixer', 'plugin-case-packer');
DELETE FROM users WHERE id IN ('user-serac', 'user-coatingstech', 'user-packsys');
