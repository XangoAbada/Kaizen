import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { DirListing } from '@kaizen/shared';
import { HttpError } from '../services/projectService.js';

export const fsRouter = Router();

const listQuery = z.object({ path: z.string().optional() });

/** Probe A:\ .. Z:\ and return the drive roots that exist (Windows only). */
function windowsDrives(): string[] {
  const drives: string[] = [];
  for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    try {
      if (fs.existsSync(root)) drives.push(root);
    } catch {
      /* inaccessible drive — skip */
    }
  }
  return drives;
}

/**
 * Directory browser for the "Add project" folder picker. Lists only subdirectories.
 * Security note: this exposes directory names on the server's disk. Kaizen is a
 * single-user tool bound to localhost, so this is acceptable.
 */
fsRouter.get('/list', (req, res) => {
  const { path: raw } = listQuery.parse(req.query);
  const abs = raw && raw.trim() ? path.resolve(raw) : os.homedir();

  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(abs, { withFileTypes: true });
  } catch (e) {
    throw new HttpError(400, `Cannot read directory: ${abs} (${(e as Error).message})`);
  }

  const entries = dirents
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => ({ name: d.name, path: path.join(abs, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parentDir = path.dirname(abs);
  const parent = parentDir === abs ? null : parentDir;

  const listing: DirListing = {
    path: abs,
    parent,
    sep: path.sep,
    entries,
    ...(process.platform === 'win32' ? { drives: windowsDrives() } : {}),
  };
  res.json(listing);
});
