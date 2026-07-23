import { nanoid } from 'nanoid';
import type { TaskEvent } from '@kaizen/shared';
import { db, now } from '../database.js';

interface Row {
  id: string;
  task_id: string;
  type: string;
  payload_json: string;
  created_at: string;
}

function toEvent(r: Row): TaskEvent {
  return {
    id: r.id,
    taskId: r.task_id,
    type: r.type as TaskEvent['type'],
    payload: JSON.parse(r.payload_json),
    createdAt: r.created_at,
  };
}

export const taskEventsRepo = {
  listByTask(taskId: string): TaskEvent[] {
    return (
      db.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at').all(taskId) as unknown as Row[]
    ).map(toEvent);
  },

  add(taskId: string, type: TaskEvent['type'], payload: Record<string, unknown> = {}): TaskEvent {
    const id = nanoid(12);
    db.prepare('INSERT INTO task_events (id, task_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      taskId,
      type,
      JSON.stringify(payload),
      now(),
    );
    return { id, taskId, type, payload, createdAt: now() };
  },
};
