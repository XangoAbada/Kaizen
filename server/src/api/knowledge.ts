import { Router } from 'express';
import { z } from 'zod';
import { bus } from '../events/bus.js';
import { knowledgeRepo } from '../db/repos/knowledgeRepo.js';
import { knowledgeService } from '../services/knowledgeService.js';
import { HttpError } from '../services/projectService.js';

export const knowledgeRouter = Router();

knowledgeRouter.get('/project/:projectId', (req, res) => {
  // Index rather than read the table: picks up files written or renamed outside the app,
  // and it is a scan of a dozen small markdown files.
  res.json(knowledgeService.indexProject(req.params.projectId as string));
});

const writeSchema = z.object({ content: z.string().max(500_000) });

knowledgeRouter.put('/project/:projectId/:filename', (req, res) => {
  const projectId = req.params.projectId as string;
  const filename = req.params.filename as string;
  const { content } = writeSchema.parse(req.body ?? {});
  const ok = knowledgeService.writeDoc(projectId, filename, content);
  if (!ok) throw new HttpError(400, 'Invalid filename — must be a bare .md name');
  bus.publish({ type: 'knowledge.updated', projectId });
  const meta = knowledgeRepo.listByProject(projectId).find((d) => d.filename === filename);
  res.json(meta ?? null);
});

knowledgeRouter.delete('/project/:projectId/:filename', (req, res) => {
  const projectId = req.params.projectId as string;
  const ok = knowledgeService.deleteDoc(projectId, req.params.filename as string);
  if (!ok) throw new HttpError(400, 'Invalid filename — must be a bare .md name');
  bus.publish({ type: 'knowledge.updated', projectId });
  res.status(204).end();
});

knowledgeRouter.get('/:docId', (req, res) => {
  const doc = knowledgeRepo.get(req.params.docId as string);
  if (!doc) throw new HttpError(404, 'Knowledge doc not found');
  const content = knowledgeService.readDoc(doc.projectId, doc.filename);
  if (content === null) throw new HttpError(404, 'Knowledge file missing on disk');
  res.json({ meta: doc, content });
});
