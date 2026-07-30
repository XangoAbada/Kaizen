import { Router } from 'express';
import { z } from 'zod';
import { KNOWLEDGE_FILENAMES } from '@kaizen/shared';
import { projectsRepo } from '../db/repos/projectsRepo.js';
import { runsRepo } from '../db/repos/runsRepo.js';
import { projectService, HttpError } from '../services/projectService.js';
import { startAnalysis, startSuggestion } from '../agents/orchestrator.js';
import { isProjectBusy } from '../agents/queue.js';

export const projectsRouter = Router();

projectsRouter.get('/', (_req, res) => {
  res.json(projectsRepo.list());
});

const createSchema = z.object({
  path: z.string().min(1),
  name: z.string().optional(),
  create: z.boolean().optional(),
  initGit: z.boolean().optional(),
});

projectsRouter.post('/', async (req, res) => {
  const body = createSchema.parse(req.body);
  const project = await projectService.register(body);
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
      model: z.string().min(1).nullable(),
      outputLanguage: z.string().min(1),
      maxConcurrentRuns: z.number().int().min(1).max(10),
      autoCreateBranch: z.boolean(),
      updateKnowledgeOnDone: z.boolean().default(true),
    })
    .optional(),
});

projectsRouter.patch('/:id', (req, res) => {
  const body = patchSchema.parse(req.body);
  if (body.settings) {
    // Parallel per-project runs require branch/worktree isolation — enforce it server-side
    // regardless of what the client sent.
    if (body.settings.maxConcurrentRuns > 1) body.settings.autoCreateBranch = true;
  }
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

const analyzeSchema = z.object({
  refresh: z.boolean().optional(),
  /** Regenerate just this knowledge section instead of the whole base. */
  file: z.string().optional(),
  /** Free-text steer for a single-section run (e.g. "drop the part about X, it was removed"). */
  instruction: z.string().max(2000).optional(),
});

projectsRouter.post('/:id/analyze', (req, res) => {
  const project = projectsRepo.get(req.params.id as string);
  if (!project) throw new HttpError(404, 'Project not found');
  if (project.status === 'analyzing') throw new HttpError(409, 'Analysis already in progress');
  const { refresh, file, instruction } = analyzeSchema.parse(req.body ?? {});
  // The filename reaches a prompt and the filesystem — only known sections are allowed.
  if (file !== undefined && !KNOWLEDGE_FILENAMES.includes(file)) {
    throw new HttpError(400, 'Unknown knowledge section');
  }
  const run = startAnalysis(project, refresh ?? false, { file, instruction });
  res.status(202).json({ runId: run.id });
});

const suggestSchema = z.object({
  useWebResearch: z.boolean().optional(),
  focus: z.string().max(500).optional(),
  greenfield: z.boolean().optional(),
});

projectsRouter.post('/:id/suggest', (req, res) => {
  const project = projectsRepo.get(req.params.id as string);
  if (!project) throw new HttpError(404, 'Project not found');
  const body = suggestSchema.parse(req.body ?? {});
  const run = startSuggestion(project, {
    useWebResearch: body.useWebResearch ?? false,
    focus: body.focus,
    greenfield: body.greenfield ?? false,
  });
  res.status(202).json({ runId: run.id });
});

projectsRouter.get('/:id/runs', (req, res) => {
  res.json(runsRepo.listByProject(req.params.id as string));
});
