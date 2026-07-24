import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '@kaizen/shared';
import { projectsRepo } from '../db/repos/projectsRepo.js';
import { gitService } from './gitService.js';
import { knowledgeDir, runsDir } from '../config.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const projectService = {
  /**
   * Register a project pointing at a local directory. With `create`, a brand-new (greenfield)
   * project is scaffolded: the folder is created if missing and optionally `git init`-ed.
   */
  async register(input: { path: string; name?: string; create?: boolean; initGit?: boolean }): Promise<Project> {
    const abs = path.resolve(input.path);
    const exists = fs.existsSync(abs);

    if (exists && !fs.statSync(abs).isDirectory()) {
      throw new HttpError(400, `Path exists but is not a directory: ${abs}`);
    }
    if (!exists) {
      if (!input.create) {
        throw new HttpError(400, `Path does not exist or is not a directory: ${abs}`);
      }
      fs.mkdirSync(abs, { recursive: true });
    }
    if (projectsRepo.getByPath(abs)) {
      throw new HttpError(409, `Project with this path is already registered`);
    }
    if (input.create && input.initGit) {
      try {
        await gitService.initRepo(abs);
      } catch (e) {
        throw new HttpError(400, `Failed to initialize git repository: ${(e as Error).message}`);
      }
    }
    const name = input.name?.trim() || path.basename(abs);
    const project = projectsRepo.create({ name, path: abs, isGit: gitService.isGitRepo(abs) });
    fs.mkdirSync(knowledgeDir(project.id), { recursive: true });
    fs.mkdirSync(runsDir(project.id), { recursive: true });
    return project;
  },
};
