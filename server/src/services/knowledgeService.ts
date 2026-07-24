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

export const knowledgeService = {
  /** Scan the project's knowledge dir and sync knowledge_docs rows. */
  indexProject(projectId: string): KnowledgeDoc[] {
    const dir = knowledgeDir(projectId);
    fs.mkdirSync(dir, { recursive: true });
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
    if (!/^[\w.\-]+\.md$/.test(filename)) return null;
    const file = path.join(knowledgeDir(projectId), filename);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
  },

  /** Write (or create) a knowledge doc on disk and re-index its metadata. Returns false on an invalid filename. */
  writeDoc(projectId: string, filename: string, content: string): boolean {
    if (!/^[\w.\-]+\.md$/.test(filename)) return false;
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
