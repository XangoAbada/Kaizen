import path from 'node:path';
import type { QueueState, RunRole, TaskRun } from '@kaizen/shared';
import { config, runsDir } from '../config.js';
import { runsRepo } from '../db/repos/runsRepo.js';
import { bus } from '../events/bus.js';
import { startClaudeRun, type ActiveClaudeRun, type ClaudeRunOutcome } from './claudeRunner.js';

export interface PreparedRun {
  prompt: string;
  cwd: string;
  permissionMode: 'acceptEdits' | 'bypassPermissions' | 'plan' | 'default';
  addDirs?: string[];
  model?: string | null;
}

export interface RunSpec {
  runId: string;
  projectId: string;
  taskId: string | null;
  role: RunRole;
  /** Called right before the process starts, so prompts see fresh state. */
  prepare: () => Promise<PreparedRun> | PreparedRun;
}

interface Active {
  spec: RunSpec;
  handle: ActiveClaudeRun;
}

const queued: RunSpec[] = [];
const running = new Map<string, Active>(); // key: projectId

export function queueState(): QueueState {
  return {
    running: [...running.values()].map((a) => ({
      runId: a.spec.runId,
      projectId: a.spec.projectId,
      role: a.spec.role,
      taskId: a.spec.taskId,
    })),
    queued: queued.map((s) => ({
      runId: s.runId,
      projectId: s.projectId,
      role: s.role,
      taskId: s.taskId,
    })),
  };
}

function publishQueue(): void {
  bus.publish({ type: 'queue.updated', queue: queueState() });
}

export function enqueueRun(input: {
  projectId: string;
  taskId?: string | null;
  role: RunRole;
  prepare: RunSpec['prepare'];
}): TaskRun {
  const run = runsRepo.create({ projectId: input.projectId, taskId: input.taskId ?? null, role: input.role });
  queued.push({
    runId: run.id,
    projectId: input.projectId,
    taskId: input.taskId ?? null,
    role: input.role,
    prepare: input.prepare,
  });
  publishQueue();
  void pump();
  return run;
}

export function cancelRun(runId: string): boolean {
  const idx = queued.findIndex((s) => s.runId === runId);
  if (idx >= 0) {
    const spec = queued[idx]!;
    queued.splice(idx, 1);
    runsRepo.update(runId, { status: 'canceled', error: 'canceled while queued', finishedAt: new Date().toISOString() });
    const run = runsRepo.get(runId);
    bus.publish({
      type: 'run.finished',
      runId,
      projectId: spec.projectId,
      taskId: spec.taskId,
      role: spec.role,
      status: 'canceled',
      resultSummary: null,
      error: run?.error ?? 'canceled',
    });
    publishQueue();
    return true;
  }
  for (const active of running.values()) {
    if (active.spec.runId === runId) {
      active.handle.cancel();
      return true;
    }
  }
  return false;
}

export function isProjectBusy(projectId: string): boolean {
  return running.has(projectId) || queued.some((s) => s.projectId === projectId);
}

export function taskHasActiveRun(taskId: string): boolean {
  return (
    queued.some((s) => s.taskId === taskId) ||
    [...running.values()].some((a) => a.spec.taskId === taskId)
  );
}

async function pump(): Promise<void> {
  if (running.size >= config.maxConcurrentRuns) return;
  const idx = queued.findIndex((s) => !running.has(s.projectId));
  if (idx < 0) return;
  const spec = queued.splice(idx, 1)[0]!;

  let prepared: PreparedRun;
  try {
    prepared = await spec.prepare();
  } catch (e) {
    const error = `failed to prepare run: ${(e as Error).message}`;
    runsRepo.update(spec.runId, { status: 'failed', error, finishedAt: new Date().toISOString() });
    bus.publish({
      type: 'run.finished',
      runId: spec.runId,
      projectId: spec.projectId,
      taskId: spec.taskId,
      role: spec.role,
      status: 'failed',
      resultSummary: null,
      error,
    });
    publishQueue();
    void pump();
    return;
  }

  const transcriptPath = path.join(runsDir(spec.projectId), `${spec.runId}.jsonl`);
  runsRepo.update(spec.runId, {
    status: 'running',
    startedAt: new Date().toISOString(),
    transcriptPath,
  });
  bus.publish({
    type: 'run.started',
    runId: spec.runId,
    projectId: spec.projectId,
    taskId: spec.taskId,
    role: spec.role,
  });

  const handle = startClaudeRun({
    runId: spec.runId,
    cwd: prepared.cwd,
    prompt: prepared.prompt,
    permissionMode: prepared.permissionMode,
    model: prepared.model,
    maxTurns: config.maxTurns[spec.role],
    timeoutMs: config.timeouts[spec.role],
    addDirs: prepared.addDirs,
    transcriptPath,
    onEntry: (entry) =>
      bus.publish({ type: 'run.output', runId: spec.runId, projectId: spec.projectId, entry }),
    onInit: (info) => {
      if (info.sessionId) runsRepo.update(spec.runId, { claudeSessionId: info.sessionId });
    },
  });

  running.set(spec.projectId, { spec, handle });
  publishQueue();

  void handle.done.then((outcome: ClaudeRunOutcome) => {
    running.delete(spec.projectId);
    runsRepo.update(spec.runId, {
      status: outcome.status,
      exitCode: outcome.exitCode ?? undefined,
      numTurns: outcome.result?.numTurns ?? undefined,
      costUsd: outcome.result?.costUsd ?? undefined,
      resultSummary: outcome.result?.resultText ?? undefined,
      error: outcome.error ?? undefined,
      claudeSessionId: outcome.result?.sessionId ?? outcome.sessionId,
      finishedAt: new Date().toISOString(),
    });
    bus.publish({
      type: 'run.finished',
      runId: spec.runId,
      projectId: spec.projectId,
      taskId: spec.taskId,
      role: spec.role,
      status: outcome.status,
      resultSummary: outcome.result?.resultText ?? null,
      error: outcome.error,
    });
    publishQueue();
    void pump();
  });

  // try to fill remaining global slots
  void pump();
}
