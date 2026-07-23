import { Router } from 'express';
import { knowledgeRepo } from '../db/repos/knowledgeRepo.js';
import { knowledgeService } from '../services/knowledgeService.js';
import { HttpError } from '../services/projectService.js';

export const knowledgeRouter = Router();

knowledgeRouter.get('/project/:projectId', (req, res) => {
  res.json(knowledgeRepo.listByProject(req.params.projectId as string));
});

knowledgeRouter.get('/:docId', (req, res) => {
  const doc = knowledgeRepo.get(req.params.docId as string);
  if (!doc) throw new HttpError(404, 'Knowledge doc not found');
  const content = knowledgeService.readDoc(doc.projectId, doc.filename);
  if (content === null) throw new HttpError(404, 'Knowledge file missing on disk');
  res.json({ meta: doc, content });
});
