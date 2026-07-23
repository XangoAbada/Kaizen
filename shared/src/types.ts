export type ProjectStatus = 'idle' | 'analyzing' | 'error';

export interface Project {
  id: string;
  name: string;
  path: string;
  status: ProjectStatus;
  isGit: boolean;
  lastAnalyzedAt: string | null;
  createdAt: string;
  settings: ProjectSettings;
}

export interface ProjectSettings {
  /** claude CLI permission mode for implementer runs */
  permissionMode: 'acceptEdits' | 'bypassPermissions';
  maxAttempts: number;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  permissionMode: 'acceptEdits',
  maxAttempts: 3,
};

export type TaskStatus = 'todo' | 'in_progress' | 'ai_review' | 'user_review' | 'done';

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'ai_review', 'user_review', 'done'];

export interface FeedbackEntry {
  source: 'user' | 'reviewer';
  text: string;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  orderIndex: number;
  suggestionId: string | null;
  attemptCount: number;
  maxAttempts: number;
  baseCommit: string | null;
  feedback: FeedbackEntry[];
  createdAt: string;
  updatedAt: string;
}

export type RunRole = 'analyzer' | 'suggester' | 'implementer' | 'reviewer';
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'timeout';

export interface TaskRun {
  id: string;
  projectId: string;
  taskId: string | null;
  role: RunRole;
  status: RunStatus;
  claudeSessionId: string | null;
  exitCode: number | null;
  numTurns: number | null;
  resultSummary: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export type SuggestionKind = 'feature' | 'improvement' | 'bugfix' | 'refactor';
export type SuggestionStatus = 'proposed' | 'accepted' | 'rejected';

export interface Suggestion {
  id: string;
  projectId: string;
  title: string;
  description: string;
  rationale: string;
  kind: SuggestionKind;
  effort: 'S' | 'M' | 'L';
  impact: 'S' | 'M' | 'L';
  status: SuggestionStatus;
  source: 'ai' | 'ai_web' | 'manual';
  taskId: string | null;
  createdAt: string;
}

export interface KnowledgeDoc {
  id: string;
  projectId: string;
  filename: string;
  title: string;
  summary: string;
  updatedAt: string;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  type:
    | 'status_changed'
    | 'run_started'
    | 'run_finished'
    | 'reviewer_findings'
    | 'user_feedback'
    | 'warning'
    | 'error';
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ReviewerFinding {
  severity: 'high' | 'medium' | 'low';
  file: string;
  issue: string;
  suggested_fix: string;
}

export interface QueueState {
  running: { runId: string; projectId: string; role: RunRole; taskId: string | null }[];
  queued: { runId: string; projectId: string; role: RunRole; taskId: string | null }[];
}
