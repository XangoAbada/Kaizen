import type { Project, RunStatus, Task, TaskRun } from '@kaizen/shared';
import { knowledgeDir } from '../config.js';
import { projectsRepo } from '../db/repos/projectsRepo.js';
import { tasksRepo } from '../db/repos/tasksRepo.js';
import { taskEventsRepo } from '../db/repos/taskEventsRepo.js';
import { suggestionsRepo } from '../db/repos/suggestionsRepo.js';
import { knowledgeRepo } from '../db/repos/knowledgeRepo.js';
import { bus } from '../events/bus.js';
import { gitService } from '../services/gitService.js';
import { knowledgeService } from '../services/knowledgeService.js';
import { enqueueRun, taskHasActiveRun } from './queue.js';
import { analyzerPrompt } from './prompts/analyzer.js';
import { suggesterPrompt } from './prompts/suggester.js';
import { plannerPrompt } from './prompts/planner.js';
import { implementerPrompt } from './prompts/implementer.js';
import { reviewerPrompt } from './prompts/reviewer.js';
import { parseVerdict, plannerOutputSchema, reviewerVerdictSchema, suggestionsOutputSchema } from './verdict.js';

const INLINE_DOC_CAP_BYTES = 12_000;
const IMPLEMENTER_INLINE_DOCS = ['00-overview.md', '30-tech-stack.md', '40-entry-points.md'];
const SUGGESTER_INLINE_DOCS = ['00-overview.md', '20-features.md', '60-improvement-notes.md'];

function publishTask(task: Task): void {
  bus.publish({ type: 'task.updated', task });
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
        cwd: project.path,
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
  tasksRepo.update(task.id, { attemptCount: task.attemptCount + 1 });
  publishTask(tasksRepo.get(task.id)!);

  return enqueueRun({
    projectId: project.id,
    taskId: task.id,
    role: 'implementer',
    prepare: () => {
      const fresh = tasksRepo.get(task.id)!;
      return {
        cwd: project.path,
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
        cwd: project.path,
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

export function startAnalysis(project: Project, refresh: boolean): TaskRun {
  projectsRepo.update(project.id, { status: 'analyzing' });
  bus.publish({ type: 'project.updated', projectId: project.id });
  return enqueueRun({
    projectId: project.id,
    role: 'analyzer',
    prepare: () => ({
      cwd: project.path,
      permissionMode: 'acceptEdits',
      model: project.settings.model,
      addDirs: [knowledgeDir(project.id)],
      prompt: analyzerPrompt({
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

export function startSuggestion(project: Project, opts: { useWebResearch: boolean; focus?: string }): TaskRun {
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

function handleAnalyzerFinished(projectId: string, status: RunStatus): void {
  const project = projectsRepo.get(projectId);
  if (!project) return;
  if (status === 'succeeded') {
    knowledgeService.indexProject(projectId);
    projectsRepo.update(projectId, { status: 'idle', lastAnalyzedAt: new Date().toISOString() });
    bus.publish({ type: 'knowledge.updated', projectId });
  } else {
    projectsRepo.update(projectId, { status: status === 'canceled' ? 'idle' : 'error' });
  }
  bus.publish({ type: 'project.updated', projectId });
}

function handleSuggesterFinished(projectId: string, status: RunStatus, resultSummary: string | null): void {
  if (status !== 'succeeded') return;
  const parsed = parseVerdict(suggestionsOutputSchema, resultSummary ?? '');
  if (!parsed) {
    console.warn(`[orchestrator] suggester output for project ${projectId} could not be parsed`);
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
        handleAnalyzerFinished(event.projectId, event.status);
      } else if (event.role === 'suggester') {
        handleSuggesterFinished(event.projectId, event.status, event.resultSummary);
      }
    } catch (e) {
      console.error('[orchestrator] error handling run.finished:', e);
    }
  });
}

export { taskHasActiveRun };
