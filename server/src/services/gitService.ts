import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function git(cwd: string, args: string[], maxBuffer = 20 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer, windowsHide: true }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** Like git() but resolves stdout even on non-zero exit (diff --no-index exits 1 on difference). */
function gitAllowFail(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (_err, stdout) => {
      resolve(stdout ?? '');
    });
  });
}

export const gitService = {
  isGitRepo(dir: string): boolean {
    return fs.existsSync(path.join(dir, '.git'));
  },

  async revParseHead(dir: string): Promise<string | null> {
    try {
      return (await git(dir, ['rev-parse', 'HEAD'])).trim();
    } catch {
      return null; // no commits yet or not a repo
    }
  },

  async isDirty(dir: string): Promise<boolean> {
    try {
      return (await git(dir, ['status', '--porcelain'])).trim().length > 0;
    } catch {
      return false;
    }
  },

  /** Unified diff of tracked changes since baseCommit plus contents of untracked files. */
  async diffSince(dir: string, baseCommit: string | null): Promise<string> {
    const parts: string[] = [];
    try {
      const tracked = baseCommit ? await git(dir, ['diff', baseCommit]) : await git(dir, ['diff', 'HEAD']);
      if (tracked.trim()) parts.push(tracked);
    } catch (e) {
      parts.push(`# git diff failed: ${(e as Error).message}\n`);
    }
    const untrackedRaw = await gitAllowFail(dir, ['ls-files', '--others', '--exclude-standard']);
    const untracked = untrackedRaw.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 50);
    for (const file of untracked) {
      // /dev/null is translated by git-for-windows; exits 1 when files differ
      const diff = await gitAllowFail(dir, ['diff', '--no-index', '--', '/dev/null', file]);
      if (diff.trim()) parts.push(diff);
    }
    return parts.join('\n');
  },
};
