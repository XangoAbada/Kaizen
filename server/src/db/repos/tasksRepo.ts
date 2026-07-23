import { nanoid } from 'nanoid';
import type { FeedbackEntry, Task, TaskStatus } from '@kaizen/shared';
import { db, now } from '../database.js';

interface Row {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  order_index: number;
  suggestion_id: string | null;
  attempt_count: number;
  max_attempts: number;
  base_commit: string | null;
  feedback_json: string;
  created_at: string;
  updated_at: string;
}

function toTask(r: Row): Task {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    status: r.status as TaskStatus,
    orderIndex: r.order_index,
    suggestionId: r.suggestion_id,
    attemptCount: r.attempt_count,
    maxAttempts: r.max_attempts,
    baseCommit: r.base_commit,
    feedback: JSON.parse(r.feedback_json) as FeedbackEntry[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const tasksRepo = {
  listByProject(projectId: string): Task[] {
    return (
      db
        .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY status, order_index, created_at')
        .all(projectId) as unknown as Row[]
    ).map(toTask);
  },

  get(id: string): Task | null {
    const r = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row | undefined;
    return r ? toTask(r) : null;
  },

  create(input: {
    projectId: string;
    title: string;
    description?: string;
    suggestionId?: string | null;
    maxAttempts?: number;
  }): Task {
    const id = nanoid(12);
    const maxOrder = db
      .prepare(`SELECT COALESCE(MAX(order_index), -1) AS m FROM tasks WHERE project_id = ? AND status = 'todo'`)
      .get(input.projectId) as { m: number };
    const ts = now();
    db.prepare(
      `INSERT INTO tasks (id, project_id, title, description, status, order_index, suggestion_id, max_attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.projectId,
      input.title,
      input.description ?? '',
      maxOrder.m + 1,
      input.suggestionId ?? null,
      input.maxAttempts ?? 3,
      ts,
      ts,
    );
    return this.get(id)!;
  },

  update(
    id: string,
    patch: Partial<{
      title: string;
      description: string;
      status: TaskStatus;
      orderIndex: number;
      attemptCount: number;
      baseCommit: string;
      feedback: FeedbackEntry[];
    }>,
  ): Task | null {
    const cur = this.get(id);
    if (!cur) return null;
    db.prepare(
      `UPDATE tasks SET title = ?, description = ?, status = ?, order_index = ?, attempt_count = ?, base_commit = ?, feedback_json = ?, updated_at = ? WHERE id = ?`,
    ).run(
      patch.title ?? cur.title,
      patch.description ?? cur.description,
      patch.status ?? cur.status,
      patch.orderIndex ?? cur.orderIndex,
      patch.attemptCount ?? cur.attemptCount,
      patch.baseCommit ?? cur.baseCommit,
      JSON.stringify(patch.feedback ?? cur.feedback),
      now(),
      id,
    );
    return this.get(id);
  },

  delete(id: string): void {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  },
};
