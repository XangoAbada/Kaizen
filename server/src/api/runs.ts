import { Router } from 'express';
import fs from 'node:fs';
import type { RunOutputEntry } from '@kaizen/shared';
import { runsRepo } from '../db/repos/runsRepo.js';
import { HttpError } from '../services/projectService.js';
import { cancelRun, queueState } from '../agents/queue.js';
import { createStreamJsonParser } from '../agents/streamJsonParser.js';

export const runsRouter = Router();

runsRouter.get('/queue', (_req, res) => {
  res.json(queueState());
});

runsRouter.get('/:id', (req, res) => {
  const run = runsRepo.get(req.params.id as string);
  if (!run) throw new HttpError(404, 'Run not found');
  res.json(run);
});

/** Re-parse the stored jsonl transcript into renderable entries. */
runsRouter.get('/:id/transcript', (req, res) => {
  const run = runsRepo.get(req.params.id as string);
  if (!run) throw new HttpError(404, 'Run not found');
  const transcriptPath = runsRepo.getTranscriptPath(run.id);
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    res.json([]);
    return;
  }
  const entries: RunOutputEntry[] = [];
  const parser = createStreamJsonParser({
    onEntry: (e) => entries.push(e),
    onInit: () => {},
    onResult: () => {},
    onRawLine: () => {},
  });
  parser.push(fs.readFileSync(transcriptPath, 'utf8'));
  parser.flush();
  res.json(entries);
});

runsRouter.post('/:id/cancel', (req, res) => {
  const run = runsRepo.get(req.params.id as string);
  if (!run) throw new HttpError(404, 'Run not found');
  if (run.status !== 'queued' && run.status !== 'running') {
    throw new HttpError(409, `Run is already ${run.status}`);
  }
  const ok = cancelRun(run.id);
  if (!ok) throw new HttpError(409, 'Run could not be canceled');
  res.json({ ok: true });
});
