import { nanoid } from 'nanoid';
import type { Project, ProjectSettings, ProjectStatus } from '@kaizen/shared';
import { DEFAULT_PROJECT_SETTINGS } from '@kaizen/shared';
import { db, now } from '../database.js';

interface Row {
  id: string;
  name: string;
  path: string;
  status: string;
  is_git: number;
  last_analyzed_at: string | null;
  created_at: string;
  settings_json: string;
}

function toProject(r: Row): Project {
  return {
    id: r.id,
    name: r.name,
    path: r.path,
    status: r.status as ProjectStatus,
    isGit: r.is_git === 1,
    lastAnalyzedAt: r.last_analyzed_at,
    createdAt: r.created_at,
    settings: { ...DEFAULT_PROJECT_SETTINGS, ...JSON.parse(r.settings_json) },
  };
}

export const projectsRepo = {
  list(): Project[] {
    return (db.prepare('SELECT * FROM projects ORDER BY created_at').all() as unknown as Row[]).map(toProject);
  },

  get(id: string): Project | null {
    const r = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined;
    return r ? toProject(r) : null;
  },

  getByPath(p: string): Project | null {
    const r = db.prepare('SELECT * FROM projects WHERE path = ?').get(p) as Row | undefined;
    return r ? toProject(r) : null;
  },

  create(input: { name: string; path: string; isGit: boolean }): Project {
    const id = nanoid(12);
    db.prepare(
      `INSERT INTO projects (id, name, path, status, is_git, created_at, settings_json)
       VALUES (?, ?, ?, 'idle', ?, ?, ?)`,
    ).run(id, input.name, input.path, input.isGit ? 1 : 0, now(), JSON.stringify(DEFAULT_PROJECT_SETTINGS));
    return this.get(id)!;
  },

  update(
    id: string,
    patch: Partial<{ name: string; status: ProjectStatus; lastAnalyzedAt: string; isGit: boolean; settings: ProjectSettings }>,
  ): Project | null {
    const cur = this.get(id);
    if (!cur) return null;
    db.prepare(
      `UPDATE projects SET name = ?, status = ?, is_git = ?, last_analyzed_at = ?, settings_json = ? WHERE id = ?`,
    ).run(
      patch.name ?? cur.name,
      patch.status ?? cur.status,
      (patch.isGit ?? cur.isGit) ? 1 : 0,
      patch.lastAnalyzedAt ?? cur.lastAnalyzedAt,
      JSON.stringify(patch.settings ?? cur.settings),
      id,
    );
    return this.get(id);
  },

  delete(id: string): void {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  },
};
