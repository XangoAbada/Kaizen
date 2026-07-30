import type { Task, TaskStatus } from '@kaizen/shared';
import { canTransition } from '@kaizen/shared';
import { tasksRepo } from '../db/repos/tasksRepo.js';
import { taskEventsRepo } from '../db/repos/taskEventsRepo.js';
import { projectsRepo } from '../db/repos/projectsRepo.js';
import { bus } from '../events/bus.js';
import { startImplementation, startKnowledgeUpdate, startPlanning } from '../agents/orchestrator.js';
import { taskHasActiveRun } from '../agents/queue.js';
import { gitService } from './gitService.js';
import { HttpError } from './projectService.js';

/** Best-effort removal of a task's git worktree + branch (used when abandoning: delete/archive). */
export async function cleanupTaskWorktree(task: Task): Promise<void> {
  if (!task.worktreePath || !task.branchName) return;
  const project = projectsRepo.get(task.projectId);
  if (project?.isGit) {
    try {
      await gitService.removeWorktree(project.path, task.worktreePath);
      await gitService.deleteBranch(project.path, task.branchName);
    } catch {
      // leave orphans rather than block the delete/archive
    }
  }
  tasksRepo.clearWorktree(task.id);
}

export const taskService = {
  /** User-initiated transition (the only path from the UI). */
  async transition(taskId: string, to: TaskStatus, feedback?: string): Promise<{ task: Task; warning?: string }> {
    const task = tasksRepo.get(taskId);
    if (!task) throw new HttpError(404, 'Task not found');

    if (!canTransition(task.status, to, 'user')) {
      throw new HttpError(409, `Transition ${task.status} → ${to} is not allowed`);
    }
    if (taskHasActiveRun(taskId)) {
      throw new HttpError(409, 'Task has an active run — cancel it first');
    }

    let warning: string | undefined;

    // reject from user_review: append feedback
    if (task.status === 'user_review' && (to === 'todo' || to === 'in_progress')) {
      if (feedback?.trim()) {
        tasksRepo.update(taskId, {
          feedback: [...task.feedback, { source: 'user', text: feedback.trim(), createdAt: new Date().toISOString() }],
        });
        taskEventsRepo.add(taskId, 'user_feedback', { text: feedback.trim() });
      }
    }

    // On approval, merge the task's isolated branch back into the base branch and tear down the worktree.
    // Done before flipping the status so a merge conflict leaves the task in user_review (409, not "done").
    if (task.status === 'user_review' && to === 'done' && task.worktreePath && task.branchName) {
      const project = projectsRepo.get(task.projectId);
      if (project?.isGit) {
        if (await gitService.isDirty(task.worktreePath)) {
          await gitService.commitAll(task.worktreePath, `kaizen: ${task.title}`);
        }
        const res = await gitService.mergeBranch(project.path, task.branchName);
        if (!res.ok) {
          taskEventsRepo.add(taskId, 'warning', {
            message: `Auto-merge of ${task.branchName} failed (conflict) — branch and worktree kept for manual resolution`,
            conflict: res.conflict ?? '',
          });
          bus.publish({ type: 'task.updated', task });
          throw new HttpError(409, `Auto-merge failed: resolve conflicts on branch ${task.branchName} manually`);
        }
        await gitService.removeWorktree(project.path, task.worktreePath);
        await gitService.deleteBranch(project.path, task.branchName);
        tasksRepo.clearWorktree(taskId);
        taskEventsRepo.add(taskId, 'status_changed', { merged: task.branchName });
      }
    }

    const updated = tasksRepo.update(taskId, { status: to })!;
    taskEventsRepo.add(taskId, 'status_changed', { from: task.status, to, actor: 'user' });
    bus.publish({ type: 'task.updated', task: updated });

    if (to === 'plan') {
      startPlanning(taskId);
    } else if (to === 'in_progress') {
      const project = projectsRepo.get(task.projectId);
      if (project?.isGit && (await gitService.isDirty(project.path)) && !task.baseCommit) {
        warning = 'Working tree is dirty — the task diff will include pre-existing changes';
      }
      await startImplementation(taskId);
    } else if (to === 'done' && projectsRepo.get(task.projectId)?.settings.updateKnowledgeOnDone) {
      // Fire-and-forget: the task is already approved and merged, so a queue or git failure here
      // must never undo that. Runs after the merge block above so the diff comes from the merged tree.
      try {
        startKnowledgeUpdate(updated);
      } catch (e) {
        console.error('[knowledge] post-done update could not be started:', e);
      }
    }

    return { task: tasksRepo.get(taskId)!, warning };
  },

  /** Request changes to a task's plan: append feedback and re-run the planner. Task stays in `plan`. */
  async replan(taskId: string, feedback?: string): Promise<Task> {
    const task = tasksRepo.get(taskId);
    if (!task) throw new HttpError(404, 'Task not found');
    if (task.status !== 'plan') throw new HttpError(409, 'Task is not in the Plan stage');
    if (taskHasActiveRun(taskId)) throw new HttpError(409, 'Task has an active run — wait for it to finish');

    if (feedback?.trim()) {
      tasksRepo.update(taskId, {
        feedback: [...task.feedback, { source: 'user', text: feedback.trim(), createdAt: new Date().toISOString() }],
      });
      taskEventsRepo.add(taskId, 'user_feedback', { text: feedback.trim() });
    }

    startPlanning(taskId);
    return tasksRepo.get(taskId)!;
  },
};
