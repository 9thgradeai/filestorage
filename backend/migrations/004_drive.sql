-- 004_drive.sql
-- Drive-class organization: nested folders plus star/trash state on files.

CREATE TABLE IF NOT EXISTS folders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  trashed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_trashed ON folders(user_id, trashed_at);

-- Files belong to at most one folder. Deleting a folder row orphans files
-- parent_id (SET NULL); application code gathers and removes object storage
-- keys before deleting rows, so nothing is ever leaked to storage.
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id);
CREATE INDEX IF NOT EXISTS idx_files_trashed ON files(user_id, trashed_at);
CREATE INDEX IF NOT EXISTS idx_files_starred ON files(user_id, starred);
CREATE INDEX IF NOT EXISTS idx_files_name ON files(user_id, LOWER(original_filename));