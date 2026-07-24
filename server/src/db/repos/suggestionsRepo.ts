import { nanoid } from 'nanoid';
import type { Suggestion, SuggestionKind, SuggestionStatus } from '@kaizen/shared';
import { db, now } from '../database.js';

interface Row {
  id: string;
  project_id: string;
  title: string;
  description: string;
  rationale: string;
  kind: string;
  effort: string;
  impact: string;
  status: string;
  source: string;
  task_id: string | null;
  created_at: string;
  archived_at: string | null;
}

function toSuggestion(r: Row): Suggestion {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    rationale: r.rationale,
    kind: r.kind as SuggestionKind,
    effort: r.effort as Suggestion['effort'],
    impact: r.impact as Suggestion['impact'],
    status: r.status as SuggestionStatus,
    source: r.source as Suggestion['source'],
    taskId: r.task_id,
    createdAt: r.created_at,
    archivedAt: r.archived_at,
  };
}

export const suggestionsRepo = {
  listByProject(projectId: string, status?: SuggestionStatus): Suggestion[] {
    const rows = status
      ? db
          .prepare('SELECT * FROM suggestions WHERE project_id = ? AND status = ? ORDER BY created_at DESC')
          .all(projectId, status)
      : db.prepare('SELECT * FROM suggestions WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
    return (rows as unknown as Row[]).map(toSuggestion);
  },

  titles(projectId: string): string[] {
    return (db.prepare('SELECT title FROM suggestions WHERE project_id = ?').all(projectId) as { title: string }[]).map(
      (r) => r.title,
    );
  },

  get(id: string): Suggestion | null {
    const r = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id) as Row | undefined;
    return r ? toSuggestion(r) : null;
  },

  create(input: {
    projectId: string;
    title: string;
    description: string;
    rationale: string;
    kind: SuggestionKind;
    effort: Suggestion['effort'];
    impact: Suggestion['impact'];
    source: Suggestion['source'];
  }): Suggestion {
    const id = nanoid(12);
    db.prepare(
      `INSERT INTO suggestions (id, project_id, title, description, rationale, kind, effort, impact, status, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`,
    ).run(
      id,
      input.projectId,
      input.title,
      input.description,
      input.rationale,
      input.kind,
      input.effort,
      input.impact,
      input.source,
      now(),
    );
    return this.get(id)!;
  },

  update(id: string, patch: Partial<{ status: SuggestionStatus; taskId: string }>): Suggestion | null {
    const cur = this.get(id);
    if (!cur) return null;
    db.prepare('UPDATE suggestions SET status = ?, task_id = ? WHERE id = ?').run(
      patch.status ?? cur.status,
      patch.taskId ?? cur.taskId,
      id,
    );
    return this.get(id);
  },

  archive(id: string): Suggestion | null {
    if (!this.get(id)) return null;
    db.prepare('UPDATE suggestions SET archived_at = ? WHERE id = ?').run(now(), id);
    return this.get(id);
  },

  unarchive(id: string): Suggestion | null {
    if (!this.get(id)) return null;
    db.prepare('UPDATE suggestions SET archived_at = NULL WHERE id = ?').run(id);
    return this.get(id);
  },

  delete(id: string): void {
    db.prepare('DELETE FROM suggestions WHERE id = ?').run(id);
  },
};
