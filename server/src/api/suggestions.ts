import { Router } from 'express';
import { z } from 'zod';
import { suggestionsRepo } from '../db/repos/suggestionsRepo.js';
import { tasksRepo } from '../db/repos/tasksRepo.js';
import { projectsRepo } from '../db/repos/projectsRepo.js';
import { HttpError } from '../services/projectService.js';
import { bus } from '../events/bus.js';

export const suggestionsRouter = Router();

suggestionsRouter.get('/project/:projectId', (req, res) => {
  const status = req.query.status as 'proposed' | 'accepted' | 'rejected' | undefined;
  res.json(suggestionsRepo.listByProject(req.params.projectId as string, status));
});

const manualSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(300),
  description: z.string().max(20_000).optional(),
  rationale: z.string().max(5_000).optional(),
  kind: z.enum(['feature', 'improvement', 'bugfix', 'refactor']).optional(),
});

suggestionsRouter.post('/', (req, res) => {
  const body = manualSchema.parse(req.body);
  if (!projectsRepo.get(body.projectId)) throw new HttpError(404, 'Project not found');
  const suggestion = suggestionsRepo.create({
    projectId: body.projectId,
    title: body.title,
    description: body.description ?? '',
    rationale: body.rationale ?? '',
    kind: body.kind ?? 'improvement',
    effort: 'M',
    impact: 'M',
    source: 'manual',
  });
  bus.publish({ type: 'suggestion.created', suggestion });
  res.status(201).json(suggestion);
});

suggestionsRouter.post('/:id/accept', (req, res) => {
  const suggestion = suggestionsRepo.get(req.params.id as string);
  if (!suggestion) throw new HttpError(404, 'Suggestion not found');
  // Accept works from 'proposed' or 'rejected' (re-accepting a previously rejected suggestion).
  if (suggestion.status === 'accepted') throw new HttpError(409, 'Suggestion is already accepted');
  const project = projectsRepo.get(suggestion.projectId)!;
  const task = tasksRepo.create({
    projectId: suggestion.projectId,
    title: suggestion.title,
    description: `${suggestion.description}\n\n**Rationale:** ${suggestion.rationale}`.trim(),
    suggestionId: suggestion.id,
    maxAttempts: project.settings.maxAttempts,
  });
  const updated = suggestionsRepo.update(suggestion.id, { status: 'accepted', taskId: task.id })!;
  bus.publish({ type: 'task.updated', task });
  res.json({ suggestion: updated, task });
});

suggestionsRouter.post('/:id/reject', (req, res) => {
  const suggestion = suggestionsRepo.get(req.params.id as string);
  if (!suggestion) throw new HttpError(404, 'Suggestion not found');
  if (suggestion.status !== 'proposed') throw new HttpError(409, `Suggestion is already ${suggestion.status}`);
  res.json(suggestionsRepo.update(suggestion.id, { status: 'rejected' }));
});

suggestionsRouter.post('/:id/archive', (req, res) => {
  const suggestion = suggestionsRepo.get(req.params.id as string);
  if (!suggestion) throw new HttpError(404, 'Suggestion not found');
  if (suggestion.status === 'proposed')
    throw new HttpError(409, 'Only accepted or rejected suggestions can be archived');
  res.json(suggestionsRepo.archive(suggestion.id));
});

suggestionsRouter.post('/:id/unarchive', (req, res) => {
  const suggestion = suggestionsRepo.get(req.params.id as string);
  if (!suggestion) throw new HttpError(404, 'Suggestion not found');
  res.json(suggestionsRepo.unarchive(suggestion.id));
});

suggestionsRouter.delete('/:id', (req, res) => {
  const suggestion = suggestionsRepo.get(req.params.id as string);
  if (!suggestion) throw new HttpError(404, 'Suggestion not found');
  suggestionsRepo.delete(suggestion.id);
  res.status(204).end();
});
