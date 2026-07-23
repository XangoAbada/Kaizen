import type { QueueState, RunRole, RunStatus, Suggestion, Task } from './types.js';

/** A single parsed line of claude CLI stream-json output, normalized for display. */
export interface RunOutputEntry {
  kind: 'assistant_text' | 'tool_use' | 'tool_result' | 'system' | 'result' | 'stderr';
  text: string;
  ts: string;
}

export interface RunStartedEvent {
  type: 'run.started';
  runId: string;
  projectId: string;
  taskId: string | null;
  role: RunRole;
}

export interface RunOutputEvent {
  type: 'run.output';
  runId: string;
  projectId: string;
  entry: RunOutputEntry;
}

export interface RunFinishedEvent {
  type: 'run.finished';
  runId: string;
  projectId: string;
  taskId: string | null;
  role: RunRole;
  status: RunStatus;
  resultSummary: string | null;
  error: string | null;
}

export interface TaskUpdatedEvent {
  type: 'task.updated';
  task: Task;
}

export interface SuggestionCreatedEvent {
  type: 'suggestion.created';
  suggestion: Suggestion;
}

export interface KnowledgeUpdatedEvent {
  type: 'knowledge.updated';
  projectId: string;
}

export interface ProjectUpdatedEvent {
  type: 'project.updated';
  projectId: string;
}

export interface QueueUpdatedEvent {
  type: 'queue.updated';
  queue: QueueState;
}

export type KaizenEvent =
  | RunStartedEvent
  | RunOutputEvent
  | RunFinishedEvent
  | TaskUpdatedEvent
  | SuggestionCreatedEvent
  | KnowledgeUpdatedEvent
  | ProjectUpdatedEvent
  | QueueUpdatedEvent;
