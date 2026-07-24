import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RunOutputEntry, RunStatus } from '@kaizen/shared';
import { config } from '../config.js';
import { createStreamJsonParser, type ParsedResult } from './streamJsonParser.js';

let resolvedClaude: string | null = null;

/** Resolve the claude executable once at startup (where.exe on Windows, which elsewhere). */
export async function resolveClaudeCmd(): Promise<string> {
  if (config.claudeCmd) return (resolvedClaude = config.claudeCmd);
  if (resolvedClaude) return resolvedClaude;
  const finder = process.platform === 'win32' ? 'where.exe' : 'which';
  const out = await new Promise<string>((resolve, reject) => {
    execFile(finder, ['claude'], { windowsHide: true }, (err, stdout) => {
      if (err) reject(new Error('claude CLI not found on PATH — install Claude Code or set KAIZEN_CLAUDE_CMD'));
      else resolve(stdout);
    });
  });
  const first = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
  if (!first) throw new Error('claude CLI not found on PATH');
  resolvedClaude = first;
  return first;
}

export async function claudeVersion(): Promise<{ path: string; version: string }> {
  const cmd = await resolveClaudeCmd();
  const version = await new Promise<string>((resolve) => {
    execFile(cmd, ['--version'], { windowsHide: true, shell: cmd.endsWith('.cmd') || cmd.endsWith('.bat') }, (err, stdout) =>
      resolve(err ? `error: ${err.message}` : stdout.trim()),
    );
  });
  return { path: cmd, version };
}

export interface ClaudeRunSpec {
  runId: string;
  cwd: string;
  prompt: string;
  permissionMode: 'acceptEdits' | 'bypassPermissions' | 'plan' | 'default';
  /** claude CLI model id passed via --model; null/undefined = use the CLI default */
  model?: string | null;
  maxTurns: number;
  timeoutMs: number;
  addDirs?: string[];
  transcriptPath: string;
  onEntry: (entry: RunOutputEntry) => void;
  onInit?: (info: { sessionId: string | null; model: string | null }) => void;
}

export interface ClaudeRunOutcome {
  status: Extract<RunStatus, 'succeeded' | 'failed' | 'canceled' | 'timeout'>;
  exitCode: number | null;
  result: ParsedResult | null;
  sessionId: string;
  error: string | null;
}

export interface ActiveClaudeRun {
  cancel: () => void;
  done: Promise<ClaudeRunOutcome>;
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
  } else {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already dead */
    }
  }
}

export function startClaudeRun(spec: ClaudeRunSpec): ActiveClaudeRun {
  const sessionId = randomUUID();
  const cmd = resolvedClaude;
  if (!cmd) throw new Error('claude CLI not resolved — call resolveClaudeCmd() at startup');

  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-turns',
    String(spec.maxTurns),
    '--session-id',
    sessionId,
  ];
  if (spec.permissionMode === 'bypassPermissions') {
    args.push('--dangerously-skip-permissions');
  } else if (spec.permissionMode !== 'default') {
    args.push('--permission-mode', spec.permissionMode);
  }
  if (spec.model) {
    args.push('--model', spec.model);
  }
  for (const dir of spec.addDirs ?? []) {
    args.push('--add-dir', dir);
  }

  const isBatch = cmd.endsWith('.cmd') || cmd.endsWith('.bat');
  // Batch shims need shell:true (EINVAL otherwise on modern Node). The prompt always goes
  // through stdin so nothing user-controlled ever reaches argv.
  const child = spawn(isBatch ? `"${cmd}"` : cmd, args, {
    cwd: spec.cwd,
    shell: isBatch,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  fs.mkdirSync(path.dirname(spec.transcriptPath), { recursive: true });
  const transcript = fs.createWriteStream(spec.transcriptPath, { flags: 'a' });

  let finished = false;
  let canceled = false;
  let timedOut = false;
  let finalResult: ParsedResult | null = null;
  let stderrTail = '';

  const parser = createStreamJsonParser({
    onEntry: spec.onEntry,
    onInit: (info) => spec.onInit?.(info),
    onResult: (r) => {
      finalResult = r;
      const text = r.resultText.trim();
      spec.onEntry({
        kind: 'result',
        text: r.isError ? `run finished with error (${r.subtype})` : text.slice(0, 2000) || 'done',
        ts: new Date().toISOString(),
      });
    },
    onRawLine: (line) => transcript.write(line + '\n'),
  });

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => parser.push(chunk));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-4000);
  });

  child.stdin.write(spec.prompt);
  child.stdin.end();

  const timer = setTimeout(() => {
    timedOut = true;
    killTree(child);
  }, spec.timeoutMs);

  const done = new Promise<ClaudeRunOutcome>((resolve) => {
    const finish = (exitCode: number | null, spawnError?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      parser.flush();
      transcript.end();

      const result = finalResult;
      let status: ClaudeRunOutcome['status'];
      let error: string | null = null;

      if (canceled) {
        status = 'canceled';
        error = 'canceled by user';
      } else if (timedOut) {
        status = 'timeout';
        error = `run exceeded timeout of ${Math.round(spec.timeoutMs / 60000)} min`;
      } else if (spawnError) {
        status = 'failed';
        error = `failed to spawn claude: ${spawnError.message}`;
      } else if (result && !result.isError && exitCode === 0) {
        status = 'succeeded';
      } else {
        status = 'failed';
        error =
          (result?.isError ? `claude reported error (${result.subtype})` : null) ??
          (exitCode !== 0 ? `claude exited with code ${exitCode}` : 'unknown failure');
        if (stderrTail.trim()) error += ` — stderr: ${stderrTail.trim().slice(-1000)}`;
        if (result?.resultText) error += ` — ${result.resultText.slice(0, 500)}`;
      }

      resolve({ status, exitCode, result, sessionId, error });
    };

    child.on('error', (err) => finish(null, err));
    child.on('close', (code) => finish(code));
  });

  return {
    cancel: () => {
      canceled = true;
      killTree(child);
    },
    done,
  };
}
