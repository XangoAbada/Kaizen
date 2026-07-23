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
  register(input: { path: string; name?: string }): Project {
    const abs = path.resolve(input.path);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new HttpError(400, `Path does not exist or is not a directory: ${abs}`);
    }
    if (projectsRepo.getByPath(abs)) {
      throw new HttpError(409, `Project with this path is already registered`);
    }
    const name = input.name?.trim() || path.basename(abs);
    const project = projectsRepo.create({ name, path: abs, isGit: gitService.isGitRepo(abs) });
    fs.mkdirSync(knowledgeDir(project.id), { recursive: true });
    fs.mkdirSync(runsDir(project.id), { recursive: true });
    return project;
  },
};
