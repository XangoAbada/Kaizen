import { nanoid } from 'nanoid';
import type { KnowledgeDoc } from '@kaizen/shared';
import { db, now } from '../database.js';

interface Row {
  id: string;
  project_id: string;
  filename: string;
  title: string;
  summary: string;
  updated_at: string;
}

function toDoc(r: Row): KnowledgeDoc {
  return {
    id: r.id,
    projectId: r.project_id,
    filename: r.filename,
    title: r.title,
    summary: r.summary,
    updatedAt: r.updated_at,
  };
}

export const knowledgeRepo = {
  listByProject(projectId: string): KnowledgeDoc[] {
    return (
      db.prepare('SELECT * FROM knowledge_docs WHERE project_id = ? ORDER BY filename').all(projectId) as unknown as Row[]
    ).map(toDoc);
  },

  get(id: string): KnowledgeDoc | null {
    const r = db.prepare('SELECT * FROM knowledge_docs WHERE id = ?').get(id) as Row | undefined;
    return r ? toDoc(r) : null;
  },

  upsert(input: { projectId: string; filename: string; title: string; summary: string }): KnowledgeDoc {
    const existing = db
      .prepare('SELECT id FROM knowledge_docs WHERE project_id = ? AND filename = ?')
      .get(input.projectId, input.filename) as { id: string } | undefined;
    if (existing) {
      db.prepare('UPDATE knowledge_docs SET title = ?, summary = ?, updated_at = ? WHERE id = ?').run(
        input.title,
        input.summary,
        now(),
        existing.id,
      );
      return this.get(existing.id)!;
    }
    const id = nanoid(12);
    db.prepare(
      'INSERT INTO knowledge_docs (id, project_id, filename, title, summary, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, input.projectId, input.filename, input.title, input.summary, now());
    return this.get(id)!;
  },

  deleteMissing(projectId: string, keepFilenames: string[]): void {
    const docs = this.listByProject(projectId);
    for (const d of docs) {
      if (!keepFilenames.includes(d.filename)) {
        db.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(d.id);
      }
    }
  },
};
