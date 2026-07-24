import type { TaskStatus } from './types.js';

export type TransitionActor = 'user' | 'system';

interface TransitionRule {
  to: TaskStatus;
  actors: TransitionActor[];
}

/**
 * Single source of truth for the task state machine.
 * The kanban UI uses it to disable illegal drops; the server enforces it (409 otherwise).
 */
export const ALLOWED_TRANSITIONS: Record<TaskStatus, TransitionRule[]> = {
  todo: [
    { to: 'plan', actors: ['user'] },
    { to: 'in_progress', actors: ['user'] },
  ],
  plan: [
    { to: 'in_progress', actors: ['user'] }, // accept plan → implement
    { to: 'todo', actors: ['user'] }, // abandon planning
  ],
  in_progress: [
    { to: 'ai_review', actors: ['system'] },
    { to: 'todo', actors: ['system', 'user'] }, // run failed / canceled
  ],
  ai_review: [
    { to: 'in_progress', actors: ['system'] }, // needs_changes retry
    { to: 'user_review', actors: ['system'] },
  ],
  user_review: [
    { to: 'done', actors: ['user'] },
    { to: 'todo', actors: ['user'] }, // reject with feedback
    { to: 'in_progress', actors: ['user'] }, // reject & retry
  ],
  done: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus, actor: TransitionActor): boolean {
  return ALLOWED_TRANSITIONS[from].some((r) => r.to === to && r.actors.includes(actor));
}

/** Statuses a user may drag a card to from `from` (used by the board UI). */
export function userTargets(from: TaskStatus): TaskStatus[] {
  return ALLOWED_TRANSITIONS[from].filter((r) => r.actors.includes('user')).map((r) => r.to);
}
