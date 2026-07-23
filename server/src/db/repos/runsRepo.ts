import { nanoid } from 'nanoid';
import type { RunRole, RunStatus, TaskRun } from '@kaizen/shared';
import { db, now } from '../database.js';

interface Row {
  id: string;
  project_id: string;
  task_id: string | null;
  role: string;
  status: string;
  claude_session_id: string | null;
  exit_code: number | null;
  num_turns: number | null;
  cost_usd: number | null;
  result_summary: string | null;
  transcript_path: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

function toRun(r: Row): TaskRun {
  return {
    id: r.id,
    projectId: r.project_id,
    taskId: r.task_id,
    role: r.role as RunRole,
    status: r.status as RunStatus,
    claudeSessionId: r.claude_session_id,
    exitCode: r.exit_code,
    numTurns: r.num_turns,
    resultSummary: r.result_summary,
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    createdAt: r.created_at,
  };
}

export const runsRepo = {
  get(id: string): TaskRun | null {
    const r = db.prepare('SELECT * FROM task_runs WHERE id = ?').get(id) as Row | undefined;
    return r ? toRun(r) : null;
  },

  getTranscriptPath(id: string): string | null {
    const r = db.prepare('SELECT transcript_path FROM task_runs WHERE id = ?').get(id) as
      | { transcript_path: string | null }
      | undefined;
    return r?.transcript_path ?? null;
  },

  listByTask(taskId: string): TaskRun[] {
    return (
      db.prepare('SELECT * FROM task_runs WHERE task_id = ? ORDER BY created_at DESC').all(taskId) as unknown as Row[]
    ).map(toRun);
  },

  listByProject(projectId: string, limit = 50): TaskRun[] {
    return (
      db
        .prepare('SELECT * FROM task_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(projectId, limit) as unknown as Row[]
    ).map(toRun);
  },

  create(input: { projectId: string; taskId?: string | null; role: RunRole }): TaskRun {
    const id = nanoid(12);
    db.prepare(
      `INSERT INTO task_runs (id, project_id, task_id, role, status, created_at) VALUES (?, ?, ?, ?, 'queued', ?)`,
    ).run(id, input.projectId, input.taskId ?? null, input.role, now());
    return this.get(id)!;
  },

  update(
    id: string,
    patch: Partial<{
      status: RunStatus;
      claudeSessionId: string;
      exitCode: number;
      numTurns: number;
      costUsd: number;
      resultSummary: string;
      transcriptPath: string;
      error: string;
      startedAt: string;
      finishedAt: string;
    }>,
  ): TaskRun | null {
    const cur = db.prepare('SELECT * FROM task_runs WHERE id = ?').get(id) as Row | undefined;
    if (!cur) return null;
    db.prepare(
      `UPDATE task_runs SET status = ?, claude_session_id = ?, exit_code = ?, num_turns = ?, cost_usd = ?,
       result_summary = ?, transcript_path = ?, error = ?, started_at = ?, finished_at = ? WHERE id = ?`,
    ).run(
      patch.status ?? cur.status,
      patch.claudeSessionId ?? cur.claude_session_id,
      patch.exitCode ?? cur.exit_code,
      patch.numTurns ?? cur.num_turns,
      patch.costUsd ?? cur.cost_usd,
      patch.resultSummary ?? cur.result_summary,
      patch.transcriptPath ?? cur.transcript_path,
      patch.error ?? cur.error,
      patch.startedAt ?? cur.started_at,
      patch.finishedAt ?? cur.finished_at,
      id,
    );
    return this.get(id);
  },

  /** Boot-time recovery: mark all queued/running runs as failed, return affected runs. */
  failUnfinished(reason: string): TaskRun[] {
    const rows = db
      .prepare(`SELECT * FROM task_runs WHERE status IN ('queued', 'running')`)
      .all() as unknown as Row[];
    const ts = now();
    for (const r of rows) {
      db.prepare(`UPDATE task_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`).run(
        reason,
        ts,
        r.id,
      );
    }
    return rows.map(toRun);
  },
};
