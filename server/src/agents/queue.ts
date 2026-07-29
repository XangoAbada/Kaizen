import path from 'node:path';
import type { QueuedRunInfo, QueueState, RunRole, TaskRun } from '@kaizen/shared';
import { config, runsDir } from '../config.js';
import { runsRepo } from '../db/repos/runsRepo.js';
import { tasksRepo } from '../db/repos/tasksRepo.js';
import { appSettingsRepo } from '../db/repos/appSettingsRepo.js';
import { projectsRepo } from '../db/repos/projectsRepo.js';
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
const running = new Map<string, Active>(); // key: runId
/** Slots claimed between dequeue and `running.set` (across the `await prepare()` gap), counted per project. */
const reservedByProject = new Map<string, number>();

function reservedCount(projectId: string): number {
  return reservedByProject.get(projectId) ?? 0;
}

function reserve(projectId: string): void {
  reservedByProject.set(projectId, reservedCount(projectId) + 1);
}

function release(projectId: string): void {
  const n = reservedCount(projectId) - 1;
  if (n <= 0) reservedByProject.delete(projectId);
  else reservedByProject.set(projectId, n);
}

function totalReserved(): number {
  let n = 0;
  for (const v of reservedByProject.values()) n += v;
  return n;
}

function runningCountForProject(projectId: string): number {
  let n = 0;
  for (const a of running.values()) if (a.spec.projectId === projectId) n++;
  return n;
}

/** Runs occupying (or about to occupy) a per-project slot: already running plus reserved-in-flight. */
function activeCountForProject(projectId: string): number {
  return runningCountForProject(projectId) + reservedCount(projectId);
}

function runInfo(spec: RunSpec): QueuedRunInfo {
  return {
    runId: spec.runId,
    projectId: spec.projectId,
    role: spec.role,
    taskId: spec.taskId,
    taskTitle: spec.taskId ? (tasksRepo.get(spec.taskId)?.title ?? null) : null,
  };
}

export function queueState(): QueueState {
  return {
    running: [...running.values()].map((a) => runInfo(a.spec)),
    queued: queued.map(runInfo),
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
  return activeCountForProject(projectId) > 0 || queued.some((s) => s.projectId === projectId);
}

export function taskHasActiveRun(taskId: string): boolean {
  return (
    queued.some((s) => s.taskId === taskId) ||
    [...running.values()].some((a) => a.spec.taskId === taskId)
  );
}

/** True when a run of the given role is queued or running for the project. */
export function projectHasActiveRunOfRole(projectId: string, role: RunRole): boolean {
  return (
    queued.some((s) => s.projectId === projectId && s.role === role) ||
    [...running.values()].some((a) => a.spec.projectId === projectId && a.spec.role === role)
  );
}

function perProjectLimit(projectId: string): number {
  const project = projectsRepo.get(projectId);
  return Math.max(1, project?.settings.maxConcurrentRuns ?? 1);
}

async function pump(): Promise<void> {
  const globalMax = appSettingsRepo.getMaxConcurrentRuns();
  if (running.size + totalReserved() >= globalMax) return;
  // Pick the first queued run (FIFO) whose project still has a free per-project slot.
  const idx = queued.findIndex((s) => activeCountForProject(s.projectId) < perProjectLimit(s.projectId));
  if (idx < 0) return;
  const spec = queued.splice(idx, 1)[0]!;
  // Claim the slot immediately so a concurrent pump() (across the await below) sees it.
  reserve(spec.projectId);

  let prepared: PreparedRun;
  try {
    prepared = await spec.prepare();
  } catch (e) {
    release(spec.projectId);
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

  running.set(spec.runId, { spec, handle });
  release(spec.projectId); // slot is now reflected in `running`; stop double-counting it
  publishQueue();

  void handle.done.then((outcome: ClaudeRunOutcome) => {
    running.delete(spec.runId);
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

/** Nudge the scheduler — e.g. after the global concurrency limit is raised in settings. */
export function pumpQueue(): void {
  void pump();
}
