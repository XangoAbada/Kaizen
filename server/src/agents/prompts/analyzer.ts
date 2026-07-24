import { preamble, jsonSchemaBlock } from './common.js';

export const KNOWLEDGE_FILES = [
  '00-overview.md',
  '10-architecture.md',
  '20-features.md',
  '30-tech-stack.md',
  '40-entry-points.md',
  '50-testing.md',
  '60-improvement-notes.md',
] as const;

export function analyzerPrompt(input: {
  projectName: string;
  projectPath: string;
  knowledgeDirAbs: string;
  refresh: boolean;
  existingDocs: { filename: string; summary: string }[];
  language?: string;
}): string {
  const fileList = KNOWLEDGE_FILES.map((f) => `- ${f}`).join('\n');
  const refreshBlock = input.refresh
    ? `A knowledge base ALREADY EXISTS at that directory. Current documents and their summaries:
${input.existingDocs.map((d) => `- ${d.filename}: ${d.summary || '(no summary)'}`).join('\n')}

Re-explore the project and UPDATE files that are stale or incomplete. Preserve content that is still accurate. Rewrite files fully rather than appending changelogs.`
    : `No knowledge base exists yet — create all files from scratch.`;

  return `${preamble(input.language)}

## Mission
Thoroughly analyze the application "${input.projectName}" located at the current working directory (${input.projectPath}) and build a knowledge base about it.

${refreshBlock}

## What to explore
- Directory structure, package/build manifests, configuration
- Entry points (main files, CLI commands, routes, pages) and how to run the app
- All user-facing features and what they do
- Architecture: modules, layers, data flow, persistence, external services
- Tech stack, dependencies and their roles
- Tests: what exists, how to run them, coverage gaps
- Weak spots, TODOs, obvious improvement opportunities

## Output files
Write EXACTLY these markdown files into the knowledge directory: ${input.knowledgeDirAbs}
${fileList}

Rules for every file:
- Start with front-matter:
---
title: <short human title>
summary: <one-line summary of the file's content>
---
- Immediately after the front-matter, put a single top-level heading (# H1) with the document title, then organize the body with a clear heading hierarchy (## for sections, ### for subsections).
- Break content into sections with headings — never write long walls of text. Prefer bulleted or numbered lists over dense paragraphs, and keep paragraphs short (2-4 sentences).
- Wrap file paths, commands, function/symbol names, env vars and config keys in \`inline code\`.
- Put multi-line code, commands or config in fenced code blocks with a language tag (e.g. \`\`\`ts, \`\`\`bash, \`\`\`json).
- Use GitHub-flavored markdown tables where a table fits naturally — e.g. dependencies and their roles, entry points, routes, comparisons.
- Keep each file under ~400 lines. Be concrete: real file paths, real command names.
- 60-improvement-notes.md should list concrete weaknesses/opportunities you noticed (this feeds a suggestion engine later).

${jsonSchemaBlock(`{"files_written": ["00-overview.md", "..."], "headline_summary": "one-paragraph summary of what this app is and its state"}`)}`;
}
