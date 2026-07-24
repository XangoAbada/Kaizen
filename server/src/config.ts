import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.KAIZEN_PORT ?? 4400),
  dataDir: process.env.KAIZEN_DATA_DIR ?? path.resolve(here, '..', 'data'),
  /** Override the resolved claude executable (otherwise resolved via where/which at startup). */
  claudeCmd: process.env.KAIZEN_CLAUDE_CMD ?? null,
  maxConcurrentRuns: Number(process.env.KAIZEN_MAX_CONCURRENT ?? 2),
  /** Per-role run timeouts in milliseconds. */
  timeouts: {
    analyzer: 30 * 60_000,
    suggester: 15 * 60_000,
    planner: 15 * 60_000,
    implementer: 20 * 60_000,
    reviewer: 10 * 60_000,
    brainstormer: 15 * 60_000,
  },
  maxTurns: {
    analyzer: 120,
    suggester: 60,
    planner: 60,
    implementer: 150,
    reviewer: 40,
    brainstormer: 60,
  },
} as const;

export function projectDataDir(projectId: string): string {
  return path.join(config.dataDir, 'projects', projectId);
}

export function knowledgeDir(projectId: string): string {
  return path.join(projectDataDir(projectId), 'knowledge');
}

export function runsDir(projectId: string): string {
  return path.join(projectDataDir(projectId), 'runs');
}

/** Directory holding the isolated git worktree for a task (one worktree per task). */
export function worktreeDir(projectId: string, taskId: string): string {
  return path.join(projectDataDir(projectId), 'worktrees', taskId);
}
