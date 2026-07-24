CREATE TABLE IF NOT EXISTS brainstorm_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,           -- 'user' | 'assistant'
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brainstorm_project ON brainstorm_messages(project_id, created_at);
