CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'idle',
  is_git INTEGER NOT NULL DEFAULT 0,
  last_analyzed_at TEXT,
  created_at TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS knowledge_docs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, filename)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rationale TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'improvement',
  effort TEXT NOT NULL DEFAULT 'M',
  impact TEXT NOT NULL DEFAULT 'M',
  status TEXT NOT NULL DEFAULT 'proposed',
  source TEXT NOT NULL DEFAULT 'ai',
  task_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  order_index INTEGER NOT NULL DEFAULT 0,
  suggestion_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  base_commit TEXT,
  feedback_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  claude_session_id TEXT,
  exit_code INTEGER,
  num_turns INTEGER,
  cost_usd REAL,
  result_summary TEXT,
  transcript_path TEXT,
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status, order_index);
CREATE INDEX IF NOT EXISTS idx_runs_project ON task_runs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_task ON task_runs(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_suggestions_project ON suggestions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at);
