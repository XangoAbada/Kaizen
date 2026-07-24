import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { config } from './config.js';
import { db, runMigrations } from './db/database.js';
import { runsRepo } from './db/repos/runsRepo.js';
import { tasksRepo } from './db/repos/tasksRepo.js';
import { taskEventsRepo } from './db/repos/taskEventsRepo.js';
import { projectsRepo } from './db/repos/projectsRepo.js';
import { projectsRouter } from './api/projects.js';
import { tasksRouter } from './api/tasks.js';
import { suggestionsRouter } from './api/suggestions.js';
import { knowledgeRouter } from './api/knowledge.js';
import { runsRouter } from './api/runs.js';
import { eventsRouter } from './api/events.js';
import { fsRouter } from './api/fs.js';
import { initOrchestrator } from './agents/orchestrator.js';
import { resolveClaudeCmd, claudeVersion } from './agents/claudeRunner.js';
import { HttpError } from './services/projectService.js';

const here = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  runMigrations();

  // crash recovery: fail runs that were left queued/running, reset their tasks
  const orphaned = runsRepo.failUnfinished('server restarted while run was active');
  for (const run of orphaned) {
    if (!run.taskId) {
      if (run.role === 'analyzer') {
        const p = projectsRepo.get(run.projectId);
        if (p?.status === 'analyzing') projectsRepo.update(p.id, { status: 'idle' });
      }
      continue;
    }
    const task = tasksRepo.get(run.taskId);
    if (task && (task.status === 'in_progress' || task.status === 'ai_review')) {
      tasksRepo.update(task.id, { status: 'todo' });
      taskEventsRepo.add(task.id, 'error', { message: 'Server restarted during run — task reset to TODO' });
    }
  }
  if (orphaned.length) console.log(`[boot] recovered ${orphaned.length} orphaned run(s)`);

  let claudeInfo: { path: string; version: string } | { error: string };
  try {
    await resolveClaudeCmd();
    claudeInfo = await claudeVersion();
    console.log(`[boot] claude CLI: ${claudeInfo.path} (${claudeInfo.version})`);
  } catch (e) {
    claudeInfo = { error: (e as Error).message };
    console.warn(`[boot] WARNING: ${(e as Error).message}`);
  }

  initOrchestrator();

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    const dbOk = db.prepare('SELECT 1 AS ok').get() as { ok: number };
    res.json({ db: dbOk.ok === 1 ? 'ok' : 'error', claude: claudeInfo });
  });

  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/suggestions', suggestionsRouter);
  app.use('/api/knowledge', knowledgeRouter);
  app.use('/api/runs', runsRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/fs', fsRouter);

  // serve built frontend in production
  const webDist = path.resolve(here, '..', '..', 'web', 'dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  // error handler
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.issues });
    } else {
      console.error('[api] unhandled error:', err);
      res.status(500).json({ error: (err as Error).message ?? 'Internal error' });
    }
  });

  app.listen(config.port, () => {
    console.log(`[boot] Kaizen server listening on http://localhost:${config.port}`);
  });
}

void main();
