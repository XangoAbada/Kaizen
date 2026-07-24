import { nanoid } from 'nanoid';
import type { BrainstormMessage } from '@kaizen/shared';
import { db, now } from '../database.js';

interface Row {
  id: string;
  project_id: string;
  role: string;
  text: string;
  created_at: string;
}

function toMessage(r: Row): BrainstormMessage {
  return {
    id: r.id,
    projectId: r.project_id,
    role: r.role as BrainstormMessage['role'],
    text: r.text,
    createdAt: r.created_at,
  };
}

export const brainstormRepo = {
  listByProject(projectId: string): BrainstormMessage[] {
    const rows = db
      .prepare('SELECT * FROM brainstorm_messages WHERE project_id = ? ORDER BY created_at ASC')
      .all(projectId);
    return (rows as unknown as Row[]).map(toMessage);
  },

  create(input: { projectId: string; role: BrainstormMessage['role']; text: string }): BrainstormMessage {
    const id = nanoid(12);
    db.prepare(
      'INSERT INTO brainstorm_messages (id, project_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, input.projectId, input.role, input.text, now());
    return this.get(id)!;
  },

  get(id: string): BrainstormMessage | null {
    const r = db.prepare('SELECT * FROM brainstorm_messages WHERE id = ?').get(id) as Row | undefined;
    return r ? toMessage(r) : null;
  },

  delete(id: string): void {
    db.prepare('DELETE FROM brainstorm_messages WHERE id = ?').run(id);
  },
};
