import type { Task, TaskStatus } from '@kaizen/shared';
import { canTransition } from '@kaizen/shared';
import { tasksRepo } from '../db/repos/tasksRepo.js';
import { taskEventsRepo } from '../db/repos/taskEventsRepo.js';
import { projectsRepo } from '../db/repos/projectsRepo.js';
import { bus } from '../events/bus.js';
import { startImplementation, startPlanning } from '../agents/orchestrator.js';
import { taskHasActiveRun } from '../agents/queue.js';
import { gitService } from './gitService.js';
import { HttpError } from './projectService.js';

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
