import { Router } from 'express';
import { z } from 'zod';
import { projectsRepo } from '../db/repos/projectsRepo.js';
import { brainstormRepo } from '../db/repos/brainstormRepo.js';
import { startBrainstorm } from '../agents/orchestrator.js';
import { projectHasActiveRunOfRole } from '../agents/queue.js';
import { HttpError } from '../services/projectService.js';

export const brainstormRouter = Router();

brainstormRouter.get('/project/:projectId', (req, res) => {
  res.json(brainstormRepo.listByProject(req.params.projectId as string));
});

const sendSchema = z.object({ input: z.string().min(1).max(5000) });

brainstormRouter.post('/project/:projectId', (req, res) => {
  const projectId = req.params.projectId as string;
  const project = projectsRepo.get(projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  if (projectHasActiveRunOfRole(projectId, 'brainstormer')) {
    throw new HttpError(409, 'A brainstorming round is already in progress');
  }
  const { input } = sendSchema.parse(req.body ?? {});
  brainstormRepo.create({ projectId, role: 'user', text: input.trim() });
  const run = startBrainstorm(project);
  res.status(202).json({ runId: run.id });
});
