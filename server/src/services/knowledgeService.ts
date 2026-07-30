import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeDoc } from '@kaizen/shared';
import { knowledgeRepo } from '../db/repos/knowledgeRepo.js';
import { knowledgeDir } from '../config.js';

/** Parse a minimal front-matter block: `---\ntitle: X\nsummary: Y\n---`. */
function parseFrontMatter(content: string): { title: string; summary: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let title = '';
  let summary = '';
  if (m && m[1]) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (!kv) continue;
      if (kv[1] === 'title') title = (kv[2] ?? '').trim().replace(/^["']|["']$/g, '');
      if (kv[1] === 'summary') summary = (kv[2] ?? '').trim().replace(/^["']|["']$/g, '');
    }
  }
  if (!title) {
    const h1 = content.match(/^#\s+(.+)$/m);
    title = h1?.[1]?.trim() ?? '';
  }
  return { title, summary };
}

/** A bare `.md` filename — no path separators, no traversal. */
export function isKnowledgeFilename(filename: string): boolean {
  return /^[\w.\-]+\.md$/.test(filename);
}

/**
 * ponytail: one-shot compatibility shim for the section renumbering that introduced
 * KNOWLEDGE_SECTIONS. Renames on read so existing knowledge bases aren't orphaned and
 * nobody has to re-run a 30-minute analysis. Delete once every project has been re-indexed.
 */
const LEGACY_RENAMES: Record<string, string> = {
  '10-architecture.md': '40-architecture.md',
  '30-tech-stack.md': '70-tech-stack.md',
  '40-entry-points.md': '90-run-and-config.md',
  '50-testing.md': '95-testing.md',
};

function applyLegacyRenames(dir: string): void {
  for (const [from, to] of Object.entries(LEGACY_RENAMES)) {
    const src = path.join(dir, from);
    const dst = path.join(dir, to);
    if (!fs.existsSync(src) || fs.existsSync(dst)) continue;
    try {
      fs.renameSync(src, dst);
    } catch {
      // leave the old file in place rather than failing the whole index pass
    }
  }
}

export const knowledgeService = {
  /** Scan the project's knowledge dir and sync knowledge_docs rows. */
  indexProject(projectId: string): KnowledgeDoc[] {
    const dir = knowledgeDir(projectId);
    fs.mkdirSync(dir, { recursive: true });
    applyLegacyRenames(dir);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    for (const filename of files) {
      const content = fs.readFileSync(path.join(dir, filename), 'utf8');
      const { title, summary } = parseFrontMatter(content);
      knowledgeRepo.upsert({ projectId, filename, title: title || filename, summary });
    }
    knowledgeRepo.deleteMissing(projectId, files);
    return knowledgeRepo.listByProject(projectId);
  },

  readDoc(projectId: string, filename: string): string | null {
    // guard against path traversal — filename must be a bare .md name
    if (!isKnowledgeFilename(filename)) return null;
    const file = path.join(knowledgeDir(projectId), filename);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
  },

  /** Delete a knowledge doc from disk and re-index. Returns false on an invalid filename. */
  deleteDoc(projectId: string, filename: string): boolean {
    if (!isKnowledgeFilename(filename)) return false;
    fs.rmSync(path.join(knowledgeDir(projectId), filename), { force: true });
    this.indexProject(projectId);
    return true;
  },

  /** Write (or create) a knowledge doc on disk and re-index its metadata. Returns false on an invalid filename. */
  writeDoc(projectId: string, filename: string, content: string): boolean {
    if (!isKnowledgeFilename(filename)) return false;
    const dir = knowledgeDir(projectId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), content, 'utf8');
    this.indexProject(projectId);
    return true;
  },

  /** Read a doc capped at maxBytes (for prompt injection). */
  readDocCapped(projectId: string, filename: string, maxBytes: number): string | null {
    const content = this.readDoc(projectId, filename);
    if (content === null) return null;
    const buf = Buffer.from(content, 'utf8');
    if (buf.length <= maxBytes) return content;
    return buf.subarray(0, maxBytes).toString('utf8') + '\n\n[... truncated ...]';
  },
};
