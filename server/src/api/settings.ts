import { Router } from 'express';
import { z } from 'zod';
import { appSettingsRepo } from '../db/repos/appSettingsRepo.js';
import { pumpQueue } from '../agents/queue.js';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  res.json(appSettingsRepo.get());
});

const patchSchema = z.object({
  maxConcurrentRuns: z.number().int().min(1).max(50),
});

settingsRouter.patch('/', (req, res) => {
  const body = patchSchema.parse(req.body);
  appSettingsRepo.setMaxConcurrentRuns(body.maxConcurrentRuns);
  // A raised limit should start queued runs immediately, without a restart.
  pumpQueue();
  res.json(appSettingsRepo.get());
});
