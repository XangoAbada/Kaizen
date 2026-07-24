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
  /** claude CLI model id to pass via --model; null = use the CLI's default model */
  model: string | null;
  /** language code for natural-language output produced by the AI agents (e.g. 'en', 'pl') */
  outputLanguage: string;
  /** max runs allowed to execute concurrently within this project; >1 requires git worktree isolation */
  maxConcurrentRuns: number;
  /** run each task in its own git branch + worktree; forced on when maxConcurrentRuns > 1 */
  autoCreateBranch: boolean;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  permissionMode: 'acceptEdits',
  maxAttempts: 3,
  model: null,
  outputLanguage: 'en',
  maxConcurrentRuns: 1,
  autoCreateBranch: false,
};

/** Global, app-level settings (not scoped to a project). */
export interface AppSettings {
  /** total number of runs allowed to execute concurrently across all projects */
  maxConcurrentRuns: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  maxConcurrentRuns: 2,
};

/** Selectable claude models. `null` (not in this list) means "use the CLI default". */
export const CLAUDE_MODELS: { id: string; label: string }[] = [
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];

/** Languages the AI agents can write their natural-language output in. */
export const OUTPUT_LANGUAGES: { id: string; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'pl', label: 'Polski' },
];

/** One directory listing returned by GET /api/fs/list. */
export interface DirListing {
  /** absolute path that was listed */
  path: string;
  /** absolute path of the parent directory, or null when `path` is a filesystem root */
  parent: string | null;
  /** platform path separator ('\\' on Windows, '/' elsewhere) */
  sep: string;
  /** available drive roots (e.g. 'C:\\'); present only on Windows */
  drives?: string[];
  /** immediate subdirectories, sorted alphabetically */
  entries: { name: string; path: string }[];
}

export type TaskStatus = 'todo' | 'plan' | 'in_progress' | 'ai_review' | 'user_review' | 'done';

export const TASK_STATUSES: TaskStatus[] = ['todo', 'plan', 'in_progress', 'ai_review', 'user_review', 'done'];

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
  userPrompt: string;
  status: TaskStatus;
  orderIndex: number;
  suggestionId: string | null;
  attemptCount: number;
  maxAttempts: number;
  baseCommit: string | null;
  feedback: FeedbackEntry[];
  /** Implementation plan produced by the planner (awaiting acceptance / fed to the implementer); '' when none. */
  plan: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp when the task was archived (soft-hidden from the board); null when active. */
  archivedAt: string | null;
  /** Absolute path of the git worktree isolating this task's runs; null when the task runs in the main working tree. */
  worktreePath: string | null;
  /** Name of the git branch created for this task's worktree; null when no worktree. */
  branchName: string | null;
}

export type RunRole = 'analyzer' | 'suggester' | 'planner' | 'implementer' | 'reviewer' | 'brainstormer';
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
  /** ISO timestamp when the suggestion was archived (soft-hidden from the list); null when active. */
  archivedAt: string | null;
}

export interface KnowledgeDoc {
  id: string;
  projectId: string;
  filename: string;
  title: string;
  summary: string;
  updatedAt: string;
}

/** One turn in a project's greenfield brainstorming conversation. */
export interface BrainstormMessage {
  id: string;
  projectId: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  type:
    | 'status_changed'
    | 'run_started'
    | 'run_finished'
    | 'reviewer_findings'
    | 'plan_ready'
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
