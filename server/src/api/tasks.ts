import { Router } from 'express';
import { z } from 'zod';
import { TASK_STATUSES } from '@kaizen/shared';
import { tasksRepo } from '../db/repos/tasksRepo.js';
import { runsRepo } from '../db/repos/runsRepo.js';
import { taskEventsRepo } from '../db/repos/taskEventsRepo.js';
import { projectsRepo } from '../db/repos/projectsRepo.js';
import { taskService, cleanupTaskWorktree } from '../services/taskService.js';
import { gitService } from '../services/gitService.js';
import { HttpError } from '../services/projectService.js';
import { taskHasActiveRun } from '../agents/queue.js';
import { bus } from '../events/bus.js';

export const tasksRouter = Router();

tasksRouter.get('/project/:projectId', (req, res) => {
  const archived = req.query.archived === '1';
  res.json(tasksRepo.listByProject(req.params.projectId as string, { archived }));
});

const createSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(300),
  description: z.string().max(20_000).optional(),
  userPrompt: z.string().max(20_000).optional(),
});

tasksRouter.post('/', (req, res) => {
  const body = createSchema.parse(req.body);
  const project = projectsRepo.get(body.projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  const task = tasksRepo.create({
    projectId: body.projectId,
    title: body.title,
    description: body.description,
    userPrompt: body.userPrompt,
    maxAttempts: project.settings.maxAttempts,
  });
  bus.publish({ type: 'task.updated', task });
  res.status(201).json(task);
});

tasksRouter.get('/:id', (req, res) => {
  const task = tasksRepo.get(req.params.id as string);
  if (!task) throw new HttpError(404, 'Task not found');
  res.json({
    task,
    runs: runsRepo.listByTask(task.id),
    events: taskEventsRepo.listByTask(task.id),
  });
});

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(20_000).optional(),
  userPrompt: z.string().max(20_000).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

tasksRouter.patch('/:id', (req, res) => {
  const body = patchSchema.parse(req.body);
  const task = tasksRepo.update(req.params.id as string, body);
  if (!task) throw new HttpError(404, 'Task not found');
  bus.publish({ type: 'task.updated', task });
  res.json(task);
});

tasksRouter.post('/:id/archive', async (req, res) => {
  const id = req.params.id as string;
  const existing = tasksRepo.get(id);
  if (!existing) throw new HttpError(404, 'Task not found');
  if (taskHasActiveRun(id)) throw new HttpError(409, 'Task has an active run — cancel it first');
  await cleanupTaskWorktree(existing);
  const task = tasksRepo.archive(id)!;
  bus.publish({ type: 'task.updated', task });
  res.json(task);
});

tasksRouter.post('/:id/unarchive', (req, res) => {
  const id = req.params.id as string;
  if (!tasksRepo.get(id)) throw new HttpError(404, 'Task not found');
  const task = tasksRepo.unarchive(id)!;
  bus.publish({ type: 'task.updated', task });
  res.json(task);
});

tasksRouter.delete('/:id', async (req, res) => {
  const id = req.params.id as string;
  const task = tasksRepo.get(id);
  if (!task) throw new HttpError(404, 'Task not found');
  if (taskHasActiveRun(id)) throw new HttpError(409, 'Task has an active run — cancel it first');
  await cleanupTaskWorktree(task);
  tasksRepo.delete(id);
  bus.publish({ type: 'task.deleted', taskId: id, projectId: task.projectId });
  res.status(204).end();
});

const transitionSchema = z.object({
  to: z.enum(TASK_STATUSES as [string, ...string[]]),
  feedback: z.string().max(20_000).optional(),
});

tasksRouter.post('/:id/transition', async (req, res) => {
  const body = transitionSchema.parse(req.body);
  const result = await taskService.transition(
    req.params.id as string,
    body.to as (typeof TASK_STATUSES)[number],
    body.feedback,
  );
  res.json(result);
});

const replanSchema = z.object({ feedback: z.string().max(20_000).optional() });

tasksRouter.post('/:id/replan', async (req, res) => {
  const body = replanSchema.parse(req.body);
  const task = await taskService.replan(req.params.id as string, body.feedback);
  res.json(task);
});

tasksRouter.get('/:id/diff', async (req, res) => {
  const task = tasksRepo.get(req.params.id as string);
  if (!task) throw new HttpError(404, 'Task not found');
  const project = projectsRepo.get(task.projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  if (!project.isGit) throw new HttpError(409, 'Project is not a git repository — no diff available');
  const diff = await gitService.diffSince(task.worktreePath ?? project.path, task.baseCommit);
  res.type('text/plain').send(diff);
});
