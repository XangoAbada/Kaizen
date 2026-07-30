import type { Project, RunStatus, Task, TaskRun } from '@kaizen/shared';
import { KNOWLEDGE_FILENAMES } from '@kaizen/shared';
import { knowledgeDir, worktreeDir } from '../config.js';
import { projectsRepo } from '../db/repos/projectsRepo.js';
import { tasksRepo } from '../db/repos/tasksRepo.js';
import { taskEventsRepo } from '../db/repos/taskEventsRepo.js';
import { suggestionsRepo } from '../db/repos/suggestionsRepo.js';
import { runsRepo } from '../db/repos/runsRepo.js';
import { knowledgeRepo } from '../db/repos/knowledgeRepo.js';
import { brainstormRepo } from '../db/repos/brainstormRepo.js';
import { bus } from '../events/bus.js';
import { gitService } from '../services/gitService.js';
import { knowledgeService } from '../services/knowledgeService.js';
import { enqueueRun, taskHasActiveRun } from './queue.js';
import { analyzerPrompt, knowledgeSectionPrompt, knowledgeUpdatePrompt } from './prompts/analyzer.js';
import { suggesterPrompt } from './prompts/suggester.js';
import { plannerPrompt } from './prompts/planner.js';
import { implementerPrompt } from './prompts/implementer.js';
import { reviewerPrompt } from './prompts/reviewer.js';
import { brainstormPrompt } from './prompts/brainstorm.js';
import {
  parseVerdict,
  plannerOutputSchema,
  reviewerVerdictSchema,
  suggestionsOutputSchema,
  brainstormOutputSchema,
} from './verdict.js';

const INLINE_DOC_CAP_BYTES = 12_000;
const IMPLEMENTER_INLINE_DOCS = ['00-overview.md', '50-code-map.md', '70-tech-stack.md'];
const SUGGESTER_INLINE_DOCS = ['00-overview.md', '20-features.md', '40-architecture.md'];
/** Cap on the diff handed to the post-`done` knowledge update. */
const KNOWLEDGE_DIFF_CAP = 30_000;

function publishTask(task: Task): void {
  bus.publish({ type: 'task.updated', task });
}

/** Working directory a task's runs execute in: its isolated worktree when present, else the project root. */
function taskCwd(projectPath: string, task: Task): string {
  return task.worktreePath ?? projectPath;
}

function setTaskStatus(task: Task, status: Task['status'], detail: Record<string, unknown> = {}): Task {
  const updated = tasksRepo.update(task.id, { status })!;
  taskEventsRepo.add(task.id, 'status_changed', { from: task.status, to: status, ...detail });
  publishTask(updated);
  return updated;
}

function inlineDocs(projectId: string, filenames: string[]): { filename: string; content: string }[] {
  const docs: { filename: string; content: string }[] = [];
  for (const filename of filenames) {
    const content = knowledgeService.readDocCapped(projectId, filename, INLINE_DOC_CAP_BYTES);
    if (content) docs.push({ filename, content });
  }
  return docs;
}

function otherDocs(projectId: string, excluding: string[]): { filename: string; summary: string }[] {
  return knowledgeRepo
    .listByProject(projectId)
    .filter((d) => !excluding.includes(d.filename))
    .map((d) => ({ filename: d.filename, summary: d.summary }));
}

/** Enqueue a planner run for a task (called on todo→plan and on plan revisions). Read-only, no code changes. */
export function startPlanning(taskId: string): TaskRun {
  const task = tasksRepo.get(taskId);
  if (!task) throw new Error(`task ${taskId} not found`);
  const project = projectsRepo.get(task.projectId);
  if (!project) throw new Error(`project ${task.projectId} not found`);

  return enqueueRun({
    projectId: project.id,
    taskId: task.id,
    role: 'planner',
    prepare: () => {
      const fresh = tasksRepo.get(task.id)!;
      return {
        cwd: taskCwd(project.path, fresh),
        permissionMode: 'plan',
        model: project.settings.model,
        addDirs: [knowledgeDir(project.id)],
        prompt: plannerPrompt({
          taskTitle: fresh.title,
          taskDescription: fresh.description,
          userPrompt: fresh.userPrompt,
          feedback: fresh.feedback,
          knowledgeDirAbs: knowledgeDir(project.id),
          inlineDocs: inlineDocs(project.id, IMPLEMENTER_INLINE_DOCS),
          otherDocs: otherDocs(project.id, IMPLEMENTER_INLINE_DOCS),
          language: project.settings.outputLanguage,
        }),
      };
    },
  });
}

/** Enqueue an implementer run for a task (called on todo→in_progress and on review retries). */
export async function startImplementation(taskId: string): Promise<TaskRun> {
  const task = tasksRepo.get(taskId);
  if (!task) throw new Error(`task ${taskId} not found`);
  const project = projectsRepo.get(task.projectId);
  if (!project) throw new Error(`project ${task.projectId} not found`);

  // record base commit on first attempt so diffs/reviews have an anchor
  if (!task.baseCommit && project.isGit) {
    const head = await gitService.revParseHead(project.path);
    if (head) tasksRepo.update(task.id, { baseCommit: head });
  }

  // On the first attempt, isolate the task in its own branch + worktree when enabled.
  // (maxConcurrentRuns > 1 requires isolation; autoCreateBranch opts in even at 1.)
  const isolate = project.isGit && (project.settings.maxConcurrentRuns > 1 || project.settings.autoCreateBranch);
  const withBase = tasksRepo.get(task.id)!;
  if (isolate && !withBase.worktreePath) {
    const wt = worktreeDir(project.id, task.id);
    const branch = `kaizen/task-${task.id}`;
    try {
      await gitService.createWorktree(project.path, branch, wt, withBase.baseCommit);
      tasksRepo.setWorktree(task.id, { path: wt, branch });
    } catch (e) {
      taskEventsRepo.add(task.id, 'warning', {
        message: `Could not create git worktree — running in the main working tree: ${(e as Error).message}`,
      });
    }
  }

  tasksRepo.update(task.id, { attemptCount: task.attemptCount + 1 });
  publishTask(tasksRepo.get(task.id)!);

  return enqueueRun({
    projectId: project.id,
    taskId: task.id,
    role: 'implementer',
    prepare: () => {
      const fresh = tasksRepo.get(task.id)!;
      return {
        cwd: taskCwd(project.path, fresh),
        permissionMode: project.settings.permissionMode,
        model: project.settings.model,
        addDirs: [knowledgeDir(project.id)],
        prompt: implementerPrompt({
          taskTitle: fresh.title,
          taskDescription: fresh.description,
          userPrompt: fresh.userPrompt,
          feedback: fresh.feedback,
          plan: fresh.plan,
          knowledgeDirAbs: knowledgeDir(project.id),
          inlineDocs: inlineDocs(project.id, IMPLEMENTER_INLINE_DOCS),
          otherDocs: otherDocs(project.id, IMPLEMENTER_INLINE_DOCS),
          language: project.settings.outputLanguage,
        }),
      };
    },
  });
}

function startReview(task: Task, implementerSummary: string): TaskRun {
  const project = projectsRepo.get(task.projectId)!;
  return enqueueRun({
    projectId: project.id,
    taskId: task.id,
    role: 'reviewer',
    prepare: () => {
      const fresh = tasksRepo.get(task.id) ?? task;
      return {
        cwd: taskCwd(project.path, fresh),
        permissionMode: 'plan',
        model: project.settings.model,
        prompt: reviewerPrompt({
          taskTitle: fresh.title,
          taskDescription: fresh.description,
          userPrompt: fresh.userPrompt,
          feedback: fresh.feedback,
          implementerSummary,
          baseCommit: fresh.baseCommit,
          isGit: project.isGit,
          language: project.settings.outputLanguage,
        }),
      };
    },
  });
}

/**
 * Analyze the project into its knowledge base. With `opts.file` only that one section is
 * rewritten (optionally steered by `opts.instruction`); otherwise the whole base is rebuilt.
 */
export function startAnalysis(
  project: Project,
  refresh: boolean,
  opts: { file?: string; instruction?: string } = {},
): TaskRun {
  const file = opts.file;
  projectsRepo.update(project.id, { status: 'analyzing' });
  bus.publish({ type: 'project.updated', projectId: project.id });
  return enqueueRun({
    projectId: project.id,
    role: 'analyzer',
    target: file ?? null,
    prepare: () => ({
      cwd: project.path,
      permissionMode: 'acceptEdits',
      model: project.settings.model,
      addDirs: [knowledgeDir(project.id)],
      prompt: file
        ? knowledgeSectionPrompt({
            projectName: project.name,
            projectPath: project.path,
            knowledgeDirAbs: knowledgeDir(project.id),
            filename: file,
            currentContent: knowledgeService.readDoc(project.id, file),
            otherDocs: otherDocs(project.id, [file]),
            instruction: opts.instruction,
            language: project.settings.outputLanguage,
          })
        : analyzerPrompt({
            projectName: project.name,
            projectPath: project.path,
            knowledgeDirAbs: knowledgeDir(project.id),
            refresh,
            existingDocs: knowledgeRepo
              .listByProject(project.id)
              .map((d) => ({ filename: d.filename, summary: d.summary })),
            language: project.settings.outputLanguage,
          }),
    }),
  });
}

/** Fold a just-completed task's changes into the knowledge sections they affect. */
export function startKnowledgeUpdate(task: Task): TaskRun {
  const project = projectsRepo.get(task.projectId);
  if (!project) throw new Error(`project ${task.projectId} not found`);
  projectsRepo.update(project.id, { status: 'analyzing' });
  bus.publish({ type: 'project.updated', projectId: project.id });

  return enqueueRun({
    projectId: project.id,
    taskId: task.id,
    role: 'analyzer',
    prepare: async () => {
      // ponytail: without git (or without a baseCommit) this is empty and the agent falls back to
      // the task text — good enough; a richer change record would mean tracking edits ourselves.
      const diff = project.isGit
        ? (await gitService.diffSince(project.path, task.baseCommit)).slice(0, KNOWLEDGE_DIFF_CAP)
        : '';
      return {
        cwd: project.path,
        permissionMode: 'acceptEdits',
        model: project.settings.model,
        addDirs: [knowledgeDir(project.id)],
        prompt: knowledgeUpdatePrompt({
          projectName: project.name,
          projectPath: project.path,
          knowledgeDirAbs: knowledgeDir(project.id),
          taskTitle: task.title,
          taskDescription: task.description,
          plan: task.plan,
          diff,
          docs: knowledgeRepo
            .listByProject(project.id)
            .map((d) => ({ filename: d.filename, summary: d.summary })),
          language: project.settings.outputLanguage,
        }),
      };
    },
  });
}

export function startSuggestion(
  project: Project,
  opts: { useWebResearch: boolean; focus?: string; greenfield?: boolean },
): TaskRun {
  return enqueueRun({
    projectId: project.id,
    role: 'suggester',
    prepare: () => ({
      cwd: project.path,
      permissionMode: 'plan',
      model: project.settings.model,
      addDirs: [knowledgeDir(project.id)],
      prompt: suggesterPrompt({
        projectName: project.name,
        knowledgeDirAbs: knowledgeDir(project.id),
        inlineDocs: inlineDocs(project.id, SUGGESTER_INLINE_DOCS),
        otherDocs: otherDocs(project.id, SUGGESTER_INLINE_DOCS),
        existingTitles: suggestionsRepo.titles(project.id),
        useWebResearch: opts.useWebResearch,
        focus: opts.focus,
        greenfield: opts.greenfield,
        language: project.settings.outputLanguage,
      }),
    }),
  });
}

/** Enqueue a brainstormer run: writes/updates the greenfield knowledge base from the conversation so far. */
export function startBrainstorm(project: Project): TaskRun {
  return enqueueRun({
    projectId: project.id,
    role: 'brainstormer',
    prepare: () => ({
      cwd: project.path,
      permissionMode: 'acceptEdits',
      model: project.settings.model,
      addDirs: [knowledgeDir(project.id)],
      prompt: brainstormPrompt({
        projectName: project.name,
        knowledgeDirAbs: knowledgeDir(project.id),
        transcript: brainstormRepo.listByProject(project.id).map((m) => ({ role: m.role, text: m.text })),
        currentDocs: inlineDocs(project.id, KNOWLEDGE_FILENAMES),
        language: project.settings.outputLanguage,
      }),
    }),
  });
}

function handlePlannerFinished(taskId: string, status: RunStatus, resultSummary: string | null, error: string | null): void {
  const task = tasksRepo.get(taskId);
  if (!task || task.status !== 'plan') return;

  if (status !== 'succeeded') {
    taskEventsRepo.add(task.id, 'error', { message: error ?? `planner run ${status}` });
    setTaskStatus(task, 'todo', { reason: error ?? status });
    return;
  }

  const output = parseVerdict(plannerOutputSchema, resultSummary ?? '');
  if (!output || !output.plan.trim()) {
    taskEventsRepo.add(task.id, 'warning', { message: 'Planner produced no parseable plan — returning to TODO' });
    setTaskStatus(task, 'todo', { reason: 'unparseable_plan' });
    return;
  }

  // Store the plan; the task stays in `plan` awaiting the user's acceptance.
  const updated = tasksRepo.update(task.id, { plan: output.plan.trim() })!;
  taskEventsRepo.add(task.id, 'plan_ready', { notes: output.notes, open_questions: output.open_questions });
  publishTask(updated);
}

function handleImplementerFinished(taskId: string, status: RunStatus, resultSummary: string | null, error: string | null): void {
  const task = tasksRepo.get(taskId);
  if (!task || task.status !== 'in_progress') return;
  if (status === 'succeeded') {
    const updated = setTaskStatus(task, 'ai_review');
    startReview(updated, resultSummary ?? '');
  } else {
    taskEventsRepo.add(task.id, 'error', { message: error ?? `implementer run ${status}` });
    setTaskStatus(task, 'todo', { reason: error ?? status });
  }
}

function handleReviewerFinished(taskId: string, status: RunStatus, resultSummary: string | null, error: string | null): void {
  const task = tasksRepo.get(taskId);
  if (!task || task.status !== 'ai_review') return;

  if (status !== 'succeeded') {
    // reviewer itself failed — fail open to the human
    taskEventsRepo.add(task.id, 'warning', {
      message: `AI review failed (${error ?? status}) — passing to user review`,
    });
    setTaskStatus(task, 'user_review', { reason: 'reviewer_failed' });
    return;
  }

  const verdict = parseVerdict(reviewerVerdictSchema, resultSummary ?? '');
  if (!verdict) {
    taskEventsRepo.add(task.id, 'warning', {
      message: 'AI review verdict could not be parsed — passing to user review',
    });
    setTaskStatus(task, 'user_review', { reason: 'unparseable_verdict' });
    return;
  }

  taskEventsRepo.add(task.id, 'reviewer_findings', { verdict: verdict.verdict, summary: verdict.summary, findings: verdict.findings });

  if (verdict.verdict === 'approve') {
    setTaskStatus(task, 'user_review', { reason: 'ai_approved' });
    return;
  }

  // needs_changes
  const findingsText = [
    verdict.summary,
    ...verdict.findings.map((f) => `[${f.severity}] ${f.file}: ${f.issue}${f.suggested_fix ? ` — fix: ${f.suggested_fix}` : ''}`),
  ]
    .filter(Boolean)
    .join('\n');

  const withFeedback = tasksRepo.update(task.id, {
    feedback: [...task.feedback, { source: 'reviewer', text: findingsText, createdAt: new Date().toISOString() }],
  })!;

  if (withFeedback.attemptCount < withFeedback.maxAttempts) {
    setTaskStatus(withFeedback, 'in_progress', { reason: 'ai_needs_changes' });
    void startImplementation(withFeedback.id);
  } else {
    taskEventsRepo.add(task.id, 'warning', {
      message: `AI review found unresolved issues but max attempts (${withFeedback.maxAttempts}) reached`,
    });
    setTaskStatus(withFeedback, 'user_review', { reason: 'attempts_exhausted' });
  }
}

function handleAnalyzerFinished(projectId: string, status: RunStatus, taskId: string | null): void {
  const project = projectsRepo.get(projectId);
  if (!project) return;

  // Always pick up whatever landed on disk — a partial or failed run may still have written files.
  knowledgeService.indexProject(projectId);
  bus.publish({ type: 'knowledge.updated', projectId });

  if (status === 'succeeded') {
    // Only a full/section analysis marks the project as freshly analyzed; a post-`done` update doesn't.
    projectsRepo.update(projectId, {
      status: 'idle',
      ...(taskId ? {} : { lastAnalyzedAt: new Date().toISOString() }),
    });
  } else {
    // A background update failing must not brand the whole project as broken.
    projectsRepo.update(projectId, { status: status === 'canceled' || taskId ? 'idle' : 'error' });
  }
  bus.publish({ type: 'project.updated', projectId });
}

function handleSuggesterFinished(
  projectId: string,
  runId: string,
  status: RunStatus,
  resultSummary: string | null,
): void {
  // Attempt the parse even when the run failed or timed out — it may still carry a usable result.
  const parsed = parseVerdict(suggestionsOutputSchema, resultSummary ?? '');
  if (!parsed?.length) {
    if (status === 'canceled') return;
    // Surface the loss on the run row (ActivityTab renders it) instead of a silent console.warn.
    runsRepo.update(runId, {
      error: 'Suggester finished but no suggestions could be read from its output — none were saved.',
    });
    return;
  }
  const existing = suggestionsRepo.titles(projectId).map((t) => t.toLowerCase());
  for (const s of parsed) {
    if (existing.includes(s.title.toLowerCase())) continue;
    const created = suggestionsRepo.create({
      projectId,
      title: s.title,
      description: s.description,
      rationale: s.rationale,
      kind: s.kind,
      effort: s.effort,
      impact: s.impact,
      source: 'ai',
    });
    bus.publish({ type: 'suggestion.created', suggestion: created });
  }
}

function handleBrainstormerFinished(projectId: string, status: RunStatus, resultSummary: string | null): void {
  // Re-index whatever the agent wrote to disk so the Knowledge tab reflects it, even on partial runs.
  knowledgeService.indexProject(projectId);
  bus.publish({ type: 'knowledge.updated', projectId });

  if (status === 'succeeded') {
    const output = parseVerdict(brainstormOutputSchema, resultSummary ?? '');
    const summary = output?.summary?.trim();
    const questions = output?.open_questions?.length
      ? `\n\nOpen questions:\n${output.open_questions.map((q) => `- ${q}`).join('\n')}`
      : '';
    brainstormRepo.create({
      projectId,
      role: 'assistant',
      text: (summary || 'Updated the knowledge base.') + questions,
    });
  } else {
    brainstormRepo.create({
      projectId,
      role: 'assistant',
      text: `⚠️ The brainstorming run did not finish (${status}). Please try again.`,
    });
  }
  bus.publish({ type: 'brainstorm.updated', projectId });
}

/** Wire the orchestrator to the event bus. Call once at startup. */
export function initOrchestrator(): void {
  bus.subscribe((event) => {
    if (event.type !== 'run.finished') return;
    try {
      if (event.taskId) {
        taskEventsRepo.add(event.taskId, 'run_finished', {
          runId: event.runId,
          role: event.role,
          status: event.status,
        });
      }
      if (event.role === 'planner' && event.taskId) {
        handlePlannerFinished(event.taskId, event.status, event.resultSummary, event.error);
      } else if (event.role === 'implementer' && event.taskId) {
        handleImplementerFinished(event.taskId, event.status, event.resultSummary, event.error);
      } else if (event.role === 'reviewer' && event.taskId) {
        handleReviewerFinished(event.taskId, event.status, event.resultSummary, event.error);
      } else if (event.role === 'analyzer') {
        handleAnalyzerFinished(event.projectId, event.status, event.taskId);
      } else if (event.role === 'suggester') {
        handleSuggesterFinished(event.projectId, event.runId, event.status, event.resultSummary);
      } else if (event.role === 'brainstormer') {
        handleBrainstormerFinished(event.projectId, event.status, event.resultSummary);
      }
    } catch (e) {
      console.error('[orchestrator] error handling run.finished:', e);
    }
  });
}

export { taskHasActiveRun };
