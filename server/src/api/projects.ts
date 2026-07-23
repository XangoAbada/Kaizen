import { Router } from 'express';
import { z } from 'zod';
import { projectsRepo } from '../db/repos/projectsRepo.js';
import { runsRepo } from '../db/repos/runsRepo.js';
import { projectService, HttpError } from '../services/projectService.js';
import { startAnalysis, startSuggestion } from '../agents/orchestrator.js';
import { isProjectBusy } from '../agents/queue.js';

export const projectsRouter = Router();

projectsRouter.get('/', (_req, res) => {
  res.json(projectsRepo.list());
});

const createSchema = z.object({ path: z.string().min(1), name: z.string().optional() });

projectsRouter.post('/', (req, res) => {
  const body = createSchema.parse(req.body);
  const project = projectService.register(body);
  res.status(201).json(project);
});

projectsRouter.get('/:id', (req, res) => {
  const project = projectsRepo.get(req.params.id as string);
  if (!project) throw new HttpError(404, 'Project not found');
  res.json(project);
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  settings: z
    .object({
      permissionMode: z.enum(['acceptEdits', 'bypassPermissions']),
      maxAttempts: z.number().int().min(1).max(10),
    })
    .optional(),
});

projectsRouter.patch('/:id', (req, res) => {
  const body = patchSchema.parse(req.body);
  const project = projectsRepo.update(req.params.id as string, body);
  if (!project) throw new HttpError(404, 'Project not found');
  res.json(project);
});

projectsRouter.delete('/:id', (req, res) => {
  const id = req.params.id as string;
  if (isProjectBusy(id)) throw new HttpError(409, 'Project has queued or running work');
  projectsRepo.delete(id);
  res.status(204).end();
});

const analyzeSchema = z.object({ refresh: z.boolean().optional() });

projectsRouter.post('/:id/analyze', (req, res) => {
  const project = projectsRepo.get(req.params.id as string);
  if (!project) throw new HttpError(404, 'Project not found');
  if (project.status === 'analyzing') throw new HttpError(409, 'Analysis already in progress');
  const { refresh } = analyzeSchema.parse(req.body ?? {});
  const run = startAnalysis(project, refresh ?? false);
  res.status(202).json({ runId: run.id });
});

const suggestSchema = z.object({
  useWebResearch: z.boolean().optional(),
  focus: z.string().max(500).optional(),
});

projectsRouter.post('/:id/suggest', (req, res) => {
  const project = projectsRepo.get(req.params.id as string);
  if (!project) throw new HttpError(404, 'Project not found');
  const body = suggestSchema.parse(req.body ?? {});
  const run = startSuggestion(project, { useWebResearch: body.useWebResearch ?? false, focus: body.focus });
  res.status(202).json({ runId: run.id });
});

projectsRouter.get('/:id/runs', (req, res) => {
  res.json(runsRepo.listByProject(req.params.id as string));
});
