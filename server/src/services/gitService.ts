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

/** Run git and capture exit code + both streams, never rejecting (for operations that may legitimately fail, e.g. merge). */
function gitCapture(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const code = err ? ((err as NodeJS.ErrnoException & { code?: number }).code ?? 1) : 0;
        resolve({ code: typeof code === 'number' ? code : 1, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
  });
}

export const gitService = {
  isGitRepo(dir: string): boolean {
    return fs.existsSync(path.join(dir, '.git'));
  },

  /** Initialize a new git repository in `dir` (no-op if already a repo). */
  async initRepo(dir: string): Promise<void> {
    if (fs.existsSync(path.join(dir, '.git'))) return;
    await git(dir, ['init']);
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

  /** Name of the branch currently checked out in `dir` (null on detached HEAD or error). */
  async currentBranch(dir: string): Promise<string | null> {
    try {
      const name = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
      return name && name !== 'HEAD' ? name : null;
    } catch {
      return null;
    }
  },

  /** Create `branch` at `baseCommit` (or HEAD) and check it out into a new worktree at `worktreePath`. */
  async createWorktree(repoDir: string, branch: string, worktreePath: string, baseCommit: string | null): Promise<void> {
    await git(repoDir, ['worktree', 'add', '-b', branch, worktreePath, baseCommit ?? 'HEAD']);
  },

  /** Remove the worktree at `worktreePath` (force, discarding any uncommitted state there). */
  async removeWorktree(repoDir: string, worktreePath: string): Promise<void> {
    const res = await gitCapture(repoDir, ['worktree', 'remove', '--force', worktreePath]);
    if (res.code !== 0) {
      // Prune stale metadata if the directory was already gone.
      await gitCapture(repoDir, ['worktree', 'prune']);
    }
  },

  /** Stage and commit everything in `dir`. No-op (returns false) when the tree is clean. */
  async commitAll(dir: string, message: string): Promise<boolean> {
    await git(dir, ['add', '-A']);
    const res = await gitCapture(dir, ['commit', '-m', message]);
    return res.code === 0;
  },

  /** Merge `branch` into the branch currently checked out in `repoDir`. Aborts and reports on conflict. */
  async mergeBranch(repoDir: string, branch: string): Promise<{ ok: boolean; conflict?: string }> {
    const res = await gitCapture(repoDir, ['merge', '--no-ff', branch]);
    if (res.code === 0) return { ok: true };
    await gitCapture(repoDir, ['merge', '--abort']);
    return { ok: false, conflict: (res.stderr || res.stdout).trim() };
  },

  /** Force-delete `branch`. */
  async deleteBranch(repoDir: string, branch: string): Promise<void> {
    await gitCapture(repoDir, ['branch', '-D', branch]);
  },
};
