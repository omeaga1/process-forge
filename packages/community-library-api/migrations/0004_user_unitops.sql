-- "My unit ops", kept with the account so they follow the engineer between
-- devices. One row per saved design; removing one keeps the row as a
-- tombstone (deleted = 1) so the removal reaches the other devices too.
-- saved_at is the device's time of the save or removal: the newer one wins.
CREATE TABLE IF NOT EXISTS user_unitops (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  contract_json TEXT,
  source TEXT NOT NULL DEFAULT 'designed',
  saved_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_user_unitops_user ON user_unitops(user_id);
