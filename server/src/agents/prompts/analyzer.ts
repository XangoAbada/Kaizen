import { KNOWLEDGE_SECTIONS, knowledgeSection } from '@kaizen/shared';
import { preamble, jsonSchemaBlock } from './common.js';

const sectionList = KNOWLEDGE_SECTIONS.map((s) => `- \`${s.filename}\` — ${s.brief}`).join('\n');

/** Rules every knowledge file must follow, whoever writes it (full analysis, single section, post-task update). */
const FILE_RULES = `Rules for every knowledge file:
- FACTS ONLY. Write only what you verified in the code. No recommendations, no improvement ideas, no opinions, no guesses about intent. If you could not establish something, leave it out rather than speculating.
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
- Never add a changelog, a "what I changed" section, or dates — the file describes the current state, nothing else.`;

export function analyzerPrompt(input: {
  projectName: string;
  projectPath: string;
  knowledgeDirAbs: string;
  refresh: boolean;
  existingDocs: { filename: string; summary: string }[];
  language?: string;
}): string {
  const refreshBlock = input.refresh
    ? `A knowledge base ALREADY EXISTS at that directory. Current documents and their summaries:
${input.existingDocs.map((d) => `- ${d.filename}: ${d.summary || '(no summary)'}`).join('\n')}

Re-explore the project and UPDATE files that are stale or incomplete. Keep what is still accurate, add what is missing, and DELETE anything the code no longer supports. Rewrite files fully rather than appending changelogs.`
    : `No knowledge base exists yet — create all files from scratch.`;

  return `${preamble(input.language)}

## Mission
Thoroughly analyze the application "${input.projectName}" located at the current working directory (${input.projectPath}) and build a knowledge base describing WHAT IT ACTUALLY IS TODAY.

${refreshBlock}

## What to explore
- Directory structure, package/build manifests, configuration
- Entry points (main files, CLI commands, routes, pages) and how to run the app
- Every screen/view the user can reach and what is on it
- All user-facing features and what they do
- Architecture: modules, layers, data flow, persistence, external services
- Data model: entities, fields, relations, schema and migrations
- Tech stack, dependencies and their roles
- Tests: what exists, how to run them

## Output files
Write these markdown files into the knowledge directory: ${input.knowledgeDirAbs}
${sectionList}

Write a file only when you have real, verified content for it — an empty or padded section is worse than a missing one. Do not create files outside this list.

${FILE_RULES}

${jsonSchemaBlock(`{"files_written": ["00-overview.md", "..."], "headline_summary": "one-paragraph summary of what this app is and its state"}`)}`;
}

/** Regenerate or correct ONE knowledge section, optionally steered by a user instruction. */
export function knowledgeSectionPrompt(input: {
  projectName: string;
  projectPath: string;
  knowledgeDirAbs: string;
  filename: string;
  currentContent: string | null;
  otherDocs: { filename: string; summary: string }[];
  instruction?: string;
  language?: string;
}): string {
  const section = knowledgeSection(input.filename);
  const brief = section?.brief ?? '';
  const title = section?.title ?? input.filename;

  const current = input.currentContent
    ? `## Current content of \`${input.filename}\`

${input.currentContent}`
    : `## Current content of \`${input.filename}\`

(the file does not exist yet — write it from scratch)`;

  const others = input.otherDocs.length
    ? `## Other sections (do NOT write to these — they exist so you know what belongs elsewhere)
${input.otherDocs.map((d) => `- \`${d.filename}\`: ${d.summary || '(no summary)'}`).join('\n')}`
    : '';

  const instruction = input.instruction?.trim()
    ? `## Instruction from the user — follow it literally
${input.instruction.trim()}`
    : '';

  return `${preamble(input.language)}

## Mission
Bring ONE section of the knowledge base for "${input.projectName}" (at ${input.projectPath}) back in line with the code.

Section: \`${input.filename}\` — ${title}
Scope: ${brief}

## How to work
1. Read the current content below.
2. Verify it against the actual code in the working directory.
3. Rewrite \`${input.filename}\` IN FULL into ${input.knowledgeDirAbs}:
   - KEEP every statement that is still true.
   - ADD what is missing or newly relevant.
   - DELETE anything the code no longer supports — verify against the code, do not trust the document.

Touch EXACTLY ONE file: \`${input.knowledgeDirAbs}\`/\`${input.filename}\`. Do not create, edit or delete anything else, inside or outside the knowledge directory. Never modify the project's own source files.

${current}

${others}

${instruction}

${FILE_RULES}

${jsonSchemaBlock(`{"files_written": ["${input.filename}"], "changes": "one short paragraph on what you added, corrected and removed"}`)}`;
}

/** Fold a just-completed task's changes into whichever knowledge sections they affect. */
export function knowledgeUpdatePrompt(input: {
  projectName: string;
  projectPath: string;
  knowledgeDirAbs: string;
  taskTitle: string;
  taskDescription: string;
  plan: string;
  diff: string;
  docs: { filename: string; summary: string }[];
  language?: string;
}): string {
  const docList = KNOWLEDGE_SECTIONS.map((s) => {
    const existing = input.docs.find((d) => d.filename === s.filename);
    return `- \`${s.filename}\` — ${s.brief}${existing ? `\n  current summary: ${existing.summary || '(none)'}` : '\n  (not written yet)'}`;
  }).join('\n');

  const diffBlock = input.diff.trim()
    ? `## Diff of the change
\`\`\`diff
${input.diff}
\`\`\``
    : `## Diff of the change
(unavailable — inspect the working directory yourself to see what this task changed)`;

  return `${preamble(input.language)}

## Mission
A task was just completed and merged in "${input.projectName}" (at ${input.projectPath}). Fold what actually changed into the knowledge base so it keeps describing the app as it is now.

## The completed task
Title: ${input.taskTitle}
${input.taskDescription ? `Description: ${input.taskDescription}` : ''}
${input.plan ? `\nImplementation plan that was followed:\n${input.plan}` : ''}

${diffBlock}

## Knowledge sections (in ${input.knowledgeDirAbs})
${docList}

## How to work
1. Decide which sections this change actually affects. Usually one to three — often none beyond the obvious one.
2. \`Read\` those files from ${input.knowledgeDirAbs}. Do not read or rewrite sections the change does not touch.
3. Rewrite each affected file IN FULL: keep what is still true, add what this change introduced, DELETE what it removed or made obsolete.
4. If a section this change belongs to does not exist yet, create it — but only if you have enough verified content for it.

Write ONLY inside ${input.knowledgeDirAbs}. Never modify the project's source files — the task's implementation is already done and merged.
If nothing in the knowledge base needs to change, write nothing and say so in the output.

${FILE_RULES}

${jsonSchemaBlock(`{"files_written": ["20-features.md"], "changes": "one short paragraph on what you updated, or why nothing needed updating"}`)}`;
}
